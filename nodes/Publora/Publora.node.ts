import type {
	IDataObject,
	IExecuteFunctions,
	ILoadOptionsFunctions,
	INodeExecutionData,
	INodeListSearchResult,
	INodePropertyOptions,
	INodeType,
	INodeTypeDescription,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError, NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';
import { DateTime } from 'luxon';

import {
	MEDIA_REQUIRED_PLATFORMS,
	PLATFORM_LABELS,
	platformOf,
	publoraApiRequest,
	publoraListPosts,
} from './GenericFunctions';
import { accountFields, accountOperations } from './descriptions/AccountDescription';
import { mediaFields, mediaOperations } from './descriptions/MediaDescription';
import { postFields, postOperations } from './descriptions/PostDescription';

const STATUS_LABELS: Record<string, string> = {
	draft: 'Draft',
	failed: 'Failed',
	partially_published: 'Partially published',
	published: 'Published',
	scheduled: 'Scheduled',
};

const ALLOWED_UPLOAD_TYPE = /^(image\/|video\/|application\/pdf$)/;

function splitList(value: string): string[] {
	return value
		.split(',')
		.map((v) => v.trim())
		.filter((v) => v.length > 0);
}

export class Publora implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Publora',
		name: 'publora',
		icon: { light: 'file:publora.svg', dark: 'file:publora.dark.svg' },
		group: ['output'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description:
			'Publish and schedule posts on LinkedIn, X, Instagram, Threads, TikTok, YouTube, Facebook, Bluesky, Mastodon and Telegram',
		defaults: { name: 'Publora' },
		usableAsTool: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [{ name: 'publoraApi', required: true }],
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{ name: 'Account', value: 'account' },
					{ name: 'Media', value: 'media' },
					{ name: 'Post', value: 'post' },
				],
				default: 'post',
			},
			...postOperations,
			...postFields,
			...mediaOperations,
			...mediaFields,
			...accountOperations,
			...accountFields,
		],
	};

	methods = {
		loadOptions: {
			async getAccounts(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				const response = await publoraApiRequest.call(this, 'GET', '/platform-connections');
				const connections = (response.connections as IDataObject[] | undefined) ?? [];
				return connections
					.filter((c) => platformOf(c.platformId as string) !== 'pinterest')
					.map((c) => {
						const platform = platformOf(c.platformId as string);
						const label = PLATFORM_LABELS[platform] ?? platform;
						const who =
							(c.displayName as string) || (c.username as string) || (c.platformId as string);
						const reconnect =
							c.connectionStatus === 'reconnect_required' ? ' – reconnect in Publora' : '';
						return {
							name: `${who} (${label})${reconnect}`,
							value: c.platformId as string,
						};
					})
					.sort((a, b) => a.name.localeCompare(b.name));
			},
		},
		listSearch: {
			async searchPosts(
				this: ILoadOptionsFunctions,
				filter?: string,
			): Promise<INodeListSearchResult> {
				const posts = await publoraListPosts.call(
					this,
					{ sortBy: 'updatedAt', sortOrder: 'desc' },
					100,
				);
				const needle = (filter ?? '').toLowerCase();
				return {
					results: posts
						.filter(
							(p) =>
								!needle ||
								String(p.content ?? '')
									.toLowerCase()
									.includes(needle),
						)
						.slice(0, 50)
						.map((p) => {
							const text = String(p.content ?? '')
								.replace(/\s+/g, ' ')
								.trim();
							const status = STATUS_LABELS[p.status as string] ?? (p.status as string);
							return {
								name: `${status}: ${text.length > 70 ? text.slice(0, 70) + '…' : text || '(no text)'}`,
								value: p.postGroupId as string,
							};
						}),
				};
			},
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];
		const executionId = this.getExecutionId();
		const nodeId = this.getNode().id;

		/** Same key on a retry of the same item → Publora replays instead of posting twice. */
		const idempotencyKey = (i: number, step: string) => `n8n-${executionId}-${nodeId}-${i}-${step}`;

		const toUtc = (value: string): string => {
			const parsed = DateTime.fromISO(value, { zone: this.getTimezone() });
			if (!parsed.isValid) {
				throw new NodeOperationError(this.getNode(), `"${value}" is not a valid date and time`);
			}
			return parsed.toUTC().toISO() as string;
		};

		const uploadFile = async (
			i: number,
			postGroupId: string,
			propertyName: string,
		): Promise<IDataObject> => {
			const binary = this.helpers.assertBinaryData(i, propertyName);
			const mimeType = binary.mimeType;
			if (!ALLOWED_UPLOAD_TYPE.test(mimeType)) {
				throw new NodeOperationError(
					this.getNode(),
					`The file in "${propertyName}" is ${mimeType}, which Publora can't attach`,
					{ itemIndex: i, description: 'Use an image, a video or a PDF.' },
				);
			}
			const buffer = await this.helpers.getBinaryDataBuffer(i, propertyName);
			const fileName = binary.fileName || `${propertyName}.${binary.fileExtension ?? 'bin'}`;

			const slot = await publoraApiRequest.call(this, 'POST', '/get-upload-url', {
				fileName,
				contentType: mimeType,
				postGroupId,
			});
			await this.helpers.httpRequest({
				method: 'PUT',
				url: slot.uploadUrl as string,
				body: buffer,
				headers: { 'Content-Type': mimeType },
			});
			const completed = await publoraApiRequest.call(
				this,
				'POST',
				`/complete-media/${encodeURIComponent(slot.mediaId as string)}`,
				{},
			);
			const mediaFile = (completed.mediaFile as IDataObject | undefined) ?? {};
			return {
				mediaId: slot.mediaId,
				fileName,
				url: slot.fileUrl,
				type: mediaFile.type,
				mimeType: mediaFile.mimeType ?? mimeType,
				status: mediaFile.status,
				postMovedToDraft: slot.postGroupDemoted === true,
			};
		};

		const platformSettingsFrom = (
			fields: IDataObject,
			platforms: string[],
		): IDataObject | undefined => {
			const has = (p: string) => platforms.includes(p);
			const settings: IDataObject = {};
			if (has('tiktok') && fields.tiktokViewerSetting) {
				settings.tiktok = { viewerSetting: fields.tiktokViewerSetting };
			}
			if (has('instagram') && fields.instagramVideoType) {
				settings.instagram = { videoType: fields.instagramVideoType };
			}
			if (has('youtube')) {
				const youtube: IDataObject = {};
				if (fields.youtubePrivacy) youtube.privacy = fields.youtubePrivacy;
				if (fields.youtubeTitle) youtube.title = fields.youtubeTitle;
				if (fields.youtubeTags) youtube.tags = splitList(fields.youtubeTags as string);
				if (Object.keys(youtube).length) settings.youtube = youtube;
			}
			if (has('threads') && fields.threadsReplyControl !== undefined) {
				settings.threads = { replyControl: fields.threadsReplyControl };
			}
			if (has('twitter') && (fields.twitterReplyTo || fields.twitterQuoteTweet)) {
				const twitter: IDataObject = {};
				if (fields.twitterReplyTo) twitter.replyTo = fields.twitterReplyTo;
				if (fields.twitterQuoteTweet) twitter.quoteTweet = fields.twitterQuoteTweet;
				settings.twitter = twitter;
			}
			if (has('telegram') && fields.telegramDisableNotification !== undefined) {
				settings.telegram = { disableNotification: fields.telegramDisableNotification };
			}
			return Object.keys(settings).length ? settings : undefined;
		};

		for (let i = 0; i < items.length; i++) {
			try {
				const resource = this.getNodeParameter('resource', i) as string;
				const operation = this.getNodeParameter('operation', i) as string;
				let output: IDataObject | IDataObject[] = {};

				if (resource === 'post' && operation === 'create') {
					const platforms = this.getNodeParameter('accountIds', i) as string[];
					const content = this.getNodeParameter('text', i) as string;
					const publishMode = this.getNodeParameter('publishMode', i) as string;
					const mediaSource = this.getNodeParameter('mediaSource', i) as string;
					const fields = this.getNodeParameter('additionalFields', i, {}) as IDataObject;

					if (!platforms.length) {
						throw new NodeOperationError(this.getNode(), 'Choose at least one account', {
							itemIndex: i,
						});
					}
					const networks = [...new Set(platforms.map(platformOf))];
					const needMedia = networks.filter((n) => MEDIA_REQUIRED_PLATFORMS.includes(n));
					if (needMedia.length && mediaSource === 'none' && publishMode !== 'draft') {
						throw new NodeOperationError(
							this.getNode(),
							`${needMedia.map((n) => PLATFORM_LABELS[n]).join(', ')} ${needMedia.length === 1 ? 'needs' : 'need'} an image or a video`,
							{
								itemIndex: i,
								description: 'Set Media to URLs or Files From Input, or save the post as a draft.',
							},
						);
					}

					const body: IDataObject = { content, platforms };
					const settings = platformSettingsFrom(fields, networks);
					if (settings) body.platformSettings = settings;
					if (fields.firstComment) body.firstComments = [{ text: fields.firstComment }];
					const scheduledTime =
						publishMode === 'schedule'
							? toUtc(this.getNodeParameter('scheduledTime', i) as string)
							: undefined;

					if (mediaSource === 'binary') {
						// Files go to a draft first; Publora needs the media before it schedules or publishes.
						const propertyNames = splitList(
							this.getNodeParameter('binaryPropertyNames', i) as string,
						);
						if (!propertyNames.length) {
							throw new NodeOperationError(
								this.getNode(),
								'Enter at least one input data field name',
								{ itemIndex: i },
							);
						}
						const created = await publoraApiRequest.call(
							this,
							'POST',
							'/create-post',
							body,
							undefined,
							{
								'Idempotency-Key': idempotencyKey(i, 'create'),
							},
						);
						const postGroupId = created.postGroupId as string;
						try {
							const media: IDataObject[] = [];
							for (const name of propertyNames) media.push(await uploadFile(i, postGroupId, name));
							let result: IDataObject = { status: 'draft', scheduledTime: null };
							if (publishMode === 'now' || scheduledTime) {
								const update: IDataObject =
									publishMode === 'now'
										? { publishNow: true }
										: { status: 'scheduled', scheduledTime };
								const updated = await publoraApiRequest.call(
									this,
									'PUT',
									`/update-post/${postGroupId}`,
									update,
									undefined,
									{
										'Idempotency-Key': idempotencyKey(i, 'schedule'),
									},
								);
								const group = (updated.postGroup as IDataObject | undefined) ?? {};
								result = {
									status: group.status ?? 'scheduled',
									scheduledTime: updated.scheduledTime ?? scheduledTime,
								};
							}
							output = { postGroupId, ...result, media };
						} catch (uploadError) {
							// Don't leave a half-made post behind in Publora.
							await publoraApiRequest
								.call(this, 'DELETE', `/delete-post/${postGroupId}`)
								.catch((cleanupError: Error) =>
									this.logger.warn(
										`Publora: could not remove unfinished post ${postGroupId}: ${cleanupError.message}`,
									),
								);
							if (uploadError instanceof NodeApiError) {
								throw new NodeApiError(
									this.getNode(),
									uploadError.errorResponse ?? ({} as JsonObject),
									{
										message: uploadError.message,
										description: uploadError.description ?? undefined,
										httpCode: uploadError.httpCode ?? undefined,
										itemIndex: i,
									},
								);
							}
							throw new NodeOperationError(this.getNode(), uploadError as Error, { itemIndex: i });
						}
					} else {
						if (mediaSource === 'url') {
							const urls = splitList(this.getNodeParameter('mediaUrls', i) as string);
							if (!urls.length) {
								throw new NodeOperationError(this.getNode(), 'Enter at least one media URL', {
									itemIndex: i,
								});
							}
							body.mediaUrls = urls;
						}
						if (publishMode === 'now') body.publishNow = true;
						if (scheduledTime) body.scheduledTime = scheduledTime;
						const created = await publoraApiRequest.call(
							this,
							'POST',
							'/create-post',
							body,
							undefined,
							{
								'Idempotency-Key': idempotencyKey(i, 'create'),
							},
						);
						output = {
							postGroupId: created.postGroupId,
							status: publishMode === 'draft' ? 'draft' : 'scheduled',
							scheduledTime: created.scheduledTime ?? null,
							...(created.warnings ? { warnings: created.warnings } : {}),
							...(created.media ? { media: created.media } : {}),
						};
					}
				} else if (resource === 'post' && operation === 'get') {
					const postGroupId = this.getNodeParameter('postId', i, '', {
						extractValue: true,
					}) as string;
					const post = await publoraApiRequest.call(
						this,
						'GET',
						`/get-post/${encodeURIComponent(postGroupId)}`,
					);
					if (this.getNodeParameter('simplify', i) as boolean) {
						const targets = (post.posts as IDataObject[] | undefined) ?? [];
						output = {
							postGroupId: post.postGroupId,
							status: post.status,
							scheduledTime: post.scheduledTime ?? null,
							text: targets[0]?.content ?? null,
							accounts: post.platforms,
							networks: targets.map((t) => ({
								network: PLATFORM_LABELS[t.platform as string] ?? t.platform,
								status: t.status,
								postedId: t.postedId ?? null,
								permalink: t.permalink ?? null,
								error: (t.error as IDataObject | undefined)?.message ?? null,
							})),
						};
					} else {
						output = post;
					}
				} else if (resource === 'post' && operation === 'getAll') {
					const returnAll = this.getNodeParameter('returnAll', i) as boolean;
					const limit = returnAll ? undefined : (this.getNodeParameter('limit', i) as number);
					const filters = this.getNodeParameter('filters', i, {}) as IDataObject;
					const query: IDataObject = {};
					if (filters.status) query.status = filters.status;
					if (filters.platform) query.platform = filters.platform;
					if (filters.fromDate) query.fromDate = toUtc(filters.fromDate as string);
					if (filters.toDate) query.toDate = toUtc(filters.toDate as string);
					const posts = await publoraListPosts.call(this, query, limit);
					const simplify = this.getNodeParameter('simplify', i) as boolean;
					output = simplify
						? posts.map((p) => ({
								postGroupId: p.postGroupId,
								status: p.status,
								scheduledTime: p.scheduledTime ?? null,
								text: p.content ?? null,
								networks: ((p.platforms as IDataObject[] | undefined) ?? []).map((t) => ({
									accountId: t.platformId,
									network: PLATFORM_LABELS[t.platform as string] ?? t.platform,
									status: t.status,
								})),
								createdAt: p.createdAt,
								updatedAt: p.updatedAt,
							}))
						: posts;
				} else if (resource === 'post' && operation === 'update') {
					const postGroupId = this.getNodeParameter('postId', i, '', {
						extractValue: true,
					}) as string;
					const fields = this.getNodeParameter('updateFields', i, {}) as IDataObject;
					const body: IDataObject = {};
					if (fields.text !== undefined) body.content = fields.text;
					if (fields.accountIds !== undefined) body.platforms = fields.accountIds;
					if (fields.status) body.status = fields.status;
					if (fields.scheduledTime) body.scheduledTime = toUtc(fields.scheduledTime as string);
					if (fields.publishNow === true) body.publishNow = true;
					if (fields.mediaUrls) body.mediaUrls = splitList(fields.mediaUrls as string);
					if (fields.firstComment !== undefined) {
						body.firstComments = fields.firstComment ? [{ text: fields.firstComment }] : null;
					}
					if (!Object.keys(body).length) {
						throw new NodeOperationError(this.getNode(), 'Add at least one field to update', {
							itemIndex: i,
						});
					}
					const updated = await publoraApiRequest.call(
						this,
						'PUT',
						`/update-post/${encodeURIComponent(postGroupId)}`,
						body,
						undefined,
						{ 'Idempotency-Key': idempotencyKey(i, 'update') },
					);
					const group = (updated.postGroup as IDataObject | undefined) ?? {};
					output = {
						postGroupId,
						status: group.status,
						scheduledTime: updated.scheduledTime ?? null,
						text: group.content,
						accounts: group.platforms,
						...(updated.warnings ? { warnings: updated.warnings } : {}),
					};
				} else if (resource === 'post' && operation === 'delete') {
					const postGroupId = this.getNodeParameter('postId', i, '', {
						extractValue: true,
					}) as string;
					await publoraApiRequest.call(
						this,
						'DELETE',
						`/delete-post/${encodeURIComponent(postGroupId)}`,
					);
					output = { deleted: true, postGroupId };
				} else if (resource === 'media' && operation === 'upload') {
					const postGroupId = this.getNodeParameter('postId', i, '', {
						extractValue: true,
					}) as string;
					const propertyName = this.getNodeParameter('binaryPropertyName', i) as string;
					output = { postGroupId, ...(await uploadFile(i, postGroupId, propertyName)) };
				} else if (resource === 'account' && operation === 'getAll') {
					const response = await publoraApiRequest.call(this, 'GET', '/platform-connections');
					let connections = (response.connections as IDataObject[] | undefined) ?? [];
					if (!(this.getNodeParameter('returnAll', i) as boolean)) {
						connections = connections.slice(0, this.getNodeParameter('limit', i) as number);
					}
					output = (this.getNodeParameter('simplify', i) as boolean)
						? connections.map((c) => {
								const platform = platformOf(c.platformId as string);
								return {
									accountId: c.platformId,
									network: PLATFORM_LABELS[platform] ?? platform,
									name: c.displayName ?? c.username ?? null,
									username: c.username ?? null,
									connectionStatus: c.connectionStatus,
									tokenStatus: c.tokenStatus,
									canPublish:
										platform !== 'pinterest' && c.connectionStatus !== 'reconnect_required',
								};
							})
						: connections;
				} else {
					throw new NodeOperationError(
						this.getNode(),
						`The operation "${operation}" isn't supported for "${resource}"`,
						{
							itemIndex: i,
						},
					);
				}

				const results = Array.isArray(output) ? output : [output];
				for (const json of results) returnData.push({ json, pairedItem: { item: i } });
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({ json: { error: (error as Error).message }, pairedItem: { item: i } });
					continue;
				}
				if (error instanceof NodeApiError) {
					throw new NodeApiError(this.getNode(), error.errorResponse ?? ({} as JsonObject), {
						message: error.message,
						description: error.description ?? undefined,
						httpCode: error.httpCode ?? undefined,
						itemIndex: i,
					});
				}
				throw new NodeOperationError(this.getNode(), error as Error, { itemIndex: i });
			}
		}

		return [returnData];
	}
}

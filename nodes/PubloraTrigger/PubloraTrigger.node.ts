import { createHmac, timingSafeEqual } from 'node:crypto';
import type {
	IDataObject,
	IHookFunctions,
	INodeType,
	INodeTypeDescription,
	IWebhookFunctions,
	IWebhookResponseData,
} from 'n8n-workflow';
import { NodeApiError, NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

import { publoraApiRequest } from '../Publora/GenericFunctions';

const SIGNATURE_HEADER = 'x-publora-signature';

interface PubloraWebhook {
	_id: string;
	url: string;
	events: string[];
}

function sameEvents(a: string[], b: string[]): boolean {
	return a.length === b.length && [...a].sort().join(',') === [...b].sort().join(',');
}

/** Publora signs the raw request body with HMAC-SHA256 and sends the hex digest. */
function signatureMatches(rawBody: Buffer, header: unknown, secret: string): boolean {
	if (typeof header !== 'string' || !header || !secret) return false;
	const presented = header.startsWith('sha256=') ? header.slice('sha256='.length) : header;
	const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
	if (presented.length !== expected.length) return false;
	return timingSafeEqual(Buffer.from(presented), Buffer.from(expected));
}

export class PubloraTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Publora Trigger',
		name: 'publoraTrigger',
		icon: { light: 'file:../Publora/publora.svg', dark: 'file:../Publora/publora.dark.svg' },
		group: ['trigger'],
		version: 1,
		subtitle: '={{$parameter["events"].join(", ")}}',
		description:
			'Starts the workflow when a Publora post is published, scheduled, fails, or returns to draft',
		defaults: { name: 'Publora Trigger' },
		inputs: [],
		outputs: [NodeConnectionTypes.Main],
		credentials: [{ name: 'publoraApi', required: true }],
		webhooks: [
			{
				name: 'default',
				httpMethod: 'POST',
				responseMode: 'onReceived',
				path: 'webhook',
			},
		],
		properties: [
			{
				displayName: 'Trigger On',
				name: 'events',
				type: 'multiOptions',
				required: true,
				default: ['post.published'],
				options: [
					{
						name: 'Post Failed',
						value: 'post.failed',
						description: 'A post failed to publish on a network',
					},
					{
						name: 'Post Moved Back to Draft',
						value: 'post.demoted',
						description: 'A scheduled post returned to draft, for example after its media changed',
					},
					{
						name: 'Post Published',
						value: 'post.published',
						description: 'A post went live on a network',
					},
					{
						name: 'Post Scheduled',
						value: 'post.scheduled',
						description: 'A post was scheduled',
					},
				],
			},
			{
				displayName:
					'Publora must be able to reach this n8n instance over the internet. Addresses such as localhost or a private network IP are refused.',
				name: 'reachabilityNotice',
				type: 'notice',
				default: '',
			},
		],
	};

	webhookMethods = {
		default: {
			async checkExists(this: IHookFunctions): Promise<boolean> {
				const webhookData = this.getWorkflowStaticData('node');
				const webhookUrl = this.getNodeWebhookUrl('default') as string;
				const events = this.getNodeParameter('events') as string[];
				const response = await publoraApiRequest.call(this, 'GET', '/webhooks');
				const existing = ((response.webhooks as PubloraWebhook[] | undefined) ?? []).find(
					(w) => w.url === webhookUrl,
				);
				if (!existing) {
					delete webhookData.webhookId;
					delete webhookData.secret;
					return false;
				}
				if (
					webhookData.secret &&
					webhookData.webhookId === existing._id &&
					sameEvents(existing.events, events)
				) {
					return true;
				}
				// A subscription for this URL whose secret we no longer hold (or with other
				// events) can't be verified: remove it so create() registers a fresh one.
				try {
					await publoraApiRequest.call(this, 'DELETE', `/webhooks/${existing._id}`);
				} catch (error) {
					this.logger.error(`Publora Trigger: could not remove outdated webhook ${existing._id}`, {
						error: (error as Error).message,
					});
					throw new NodeApiError(
						this.getNode(),
						{},
						{
							message: `Could not remove an outdated Publora webhook for this workflow`,
							description: (error as Error).message,
						},
					);
				}
				delete webhookData.webhookId;
				delete webhookData.secret;
				return false;
			},

			async create(this: IHookFunctions): Promise<boolean> {
				const webhookUrl = this.getNodeWebhookUrl('default') as string;
				const events = this.getNodeParameter('events') as string[];
				if (!events.length) {
					throw new NodeOperationError(this.getNode(), 'Choose at least one event in Trigger On');
				}
				let response: IDataObject;
				try {
					response = await publoraApiRequest.call(this, 'POST', '/webhooks', {
						name: `n8n: ${this.getWorkflow().name ?? 'workflow'}`.slice(0, 100),
						url: webhookUrl,
						events,
					});
				} catch (error) {
					const message = (error as Error).message ?? '';
					if (/Maximum of 10 webhooks/i.test(message)) {
						throw new NodeApiError(
							this.getNode(),
							{},
							{
								message: 'Your Publora account already has 10 webhooks',
								description:
									'Delete unused webhooks in Publora (or deactivate other workflows that use the Publora Trigger), then try again.',
							},
						);
					}
					if (/localhost|private ip|link-local/i.test(message)) {
						throw new NodeApiError(
							this.getNode(),
							{},
							{
								message: "Publora can't reach this n8n address",
								description: `Publora only sends events to public addresses, and ${webhookUrl} isn't one. Set n8n's WEBHOOK_URL to a public URL or use a tunnel.`,
							},
						);
					}
					throw new NodeApiError(
						this.getNode(),
						{},
						{
							message: `Publora didn't create the webhook: ${message}`,
							description: (error as NodeApiError).description ?? undefined,
							httpCode: (error as NodeApiError).httpCode ?? undefined,
						},
					);
				}
				const webhook = (response.webhook as IDataObject | undefined) ?? {};
				if (!webhook._id || !webhook.secret) {
					throw new NodeApiError(this.getNode(), response as never, {
						message: "Publora didn't return the webhook details",
					});
				}
				const webhookData = this.getWorkflowStaticData('node');
				webhookData.webhookId = webhook._id;
				webhookData.secret = webhook.secret;
				return true;
			},

			async delete(this: IHookFunctions): Promise<boolean> {
				const webhookData = this.getWorkflowStaticData('node');
				if (webhookData.webhookId) {
					try {
						await publoraApiRequest.call(this, 'DELETE', `/webhooks/${webhookData.webhookId}`);
					} catch (error) {
						const status = (error as NodeApiError).httpCode;
						if (status !== '404') {
							this.logger.error(
								`Publora Trigger: could not delete webhook ${webhookData.webhookId}`,
								{
									error: (error as Error).message,
								},
							);
							return false;
						}
					}
				}
				delete webhookData.webhookId;
				delete webhookData.secret;
				return true;
			},
		},
	};

	async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
		const req = this.getRequestObject() as unknown as { rawBody?: Buffer; body?: IDataObject };
		const res = this.getResponseObject();
		const secret = this.getWorkflowStaticData('node').secret as string | undefined;
		const headers = this.getHeaderData() as IDataObject;

		if (
			!secret ||
			!req.rawBody ||
			!signatureMatches(req.rawBody, headers[SIGNATURE_HEADER], secret)
		) {
			res.status(401).json({ message: 'Invalid signature' });
			return { noWebhookResponse: true };
		}

		const payload = (req.body ?? {}) as IDataObject;
		const data = (payload.data as IDataObject | undefined) ?? {};
		return {
			workflowData: [
				this.helpers.returnJsonArray({
					event: payload.event ?? headers['x-publora-event'],
					timestamp: payload.timestamp,
					...data,
				}),
			],
		};
	}
}

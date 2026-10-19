import type { INodeProperties } from 'n8n-workflow';

export const postOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['post'] } },
		options: [
			{
				name: 'Create',
				value: 'create',
				description: 'Create a post to publish now, schedule, or keep as a draft',
				action: 'Create a post',
			},
			{
				name: 'Delete',
				value: 'delete',
				description: 'Delete a draft or scheduled post',
				action: 'Delete a post',
			},
			{
				name: 'Get',
				value: 'get',
				description: 'Get a post and its status on each network',
				action: 'Get a post',
			},
			{
				name: 'Get Many',
				value: 'getAll',
				description: 'Get many posts',
				action: 'Get many posts',
			},
			{
				name: 'Update',
				value: 'update',
				description: 'Update a draft or scheduled post',
				action: 'Update a post',
			},
		],
		default: 'create',
	},
];

const postIdLocator: INodeProperties = {
	displayName: 'Post',
	name: 'postId',
	type: 'resourceLocator',
	default: { mode: 'list', value: '' },
	required: true,
	description: 'The post to work with',
	modes: [
		{
			displayName: 'From List',
			name: 'list',
			type: 'list',
			typeOptions: { searchListMethod: 'searchPosts', searchable: true },
		},
		{
			displayName: 'ID',
			name: 'id',
			type: 'string',
			placeholder: 'e.g. 507f1f77bcf86cd799439011',
			validation: [
				{
					type: 'regex',
					properties: {
						regex: '^[a-f0-9]{24}$',
						errorMessage: 'A post ID is 24 characters: digits and letters a to f',
					},
				},
			],
		},
	],
};

export const postFields: INodeProperties[] = [
	/* ------------------------------------------------------------------ */
	/*                               post:create                          */
	/* ------------------------------------------------------------------ */
	{
		displayName: 'Account Names or IDs',
		name: 'accountIds',
		type: 'multiOptions',
		typeOptions: { loadOptionsMethod: 'getAccounts' },
		required: true,
		default: [],
		displayOptions: { show: { resource: ['post'], operation: ['create'] } },
		description:
			'Choose from the list, or specify IDs using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
	},
	{
		displayName: 'Text',
		name: 'text',
		type: 'string',
		typeOptions: { rows: 4 },
		required: true,
		default: '',
		displayOptions: { show: { resource: ['post'], operation: ['create'] } },
		description:
			'The text of the post. Long text for X, Threads and Bluesky is split into a thread automatically.',
	},
	{
		displayName: 'Publish',
		name: 'publishMode',
		type: 'options',
		default: 'draft',
		displayOptions: { show: { resource: ['post'], operation: ['create'] } },
		options: [
			{
				name: 'Now',
				value: 'now',
				description: 'Publish as soon as Publora receives the post',
			},
			{
				name: 'Save as Draft',
				value: 'draft',
				description: 'Keep the post in Publora without a publish time',
			},
			{
				name: 'Schedule',
				value: 'schedule',
				description: 'Publish at a set date and time',
			},
		],
		description: 'When the post goes out',
	},
	{
		displayName: 'Publish At',
		name: 'scheduledTime',
		type: 'dateTime',
		required: true,
		default: '',
		displayOptions: {
			show: { resource: ['post'], operation: ['create'], publishMode: ['schedule'] },
		},
		description: 'Date and time to publish. On the free plan you can schedule up to 7 days ahead.',
	},
	{
		displayName: 'Media',
		name: 'mediaSource',
		type: 'options',
		default: 'none',
		displayOptions: { show: { resource: ['post'], operation: ['create'] } },
		options: [
			{
				name: 'Files From Input',
				value: 'binary',
				description:
					'Images or a video from a previous node, such as Google Drive or an HTTP Request',
			},
			{
				name: 'None',
				value: 'none',
				description: 'Text only. Instagram, TikTok and YouTube need an image or a video.',
			},
			{
				name: 'URLs',
				value: 'url',
				description: 'Public HTTPS links to images or a video',
			},
		],
		description: 'Images or a video to attach. Instagram, TikTok and YouTube posts need one.',
	},
	{
		displayName: 'Media URLs',
		name: 'mediaUrls',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'e.g. https://example.com/photo-1.jpg, https://example.com/photo-2.jpg',
		displayOptions: { show: { resource: ['post'], operation: ['create'], mediaSource: ['url'] } },
		description: 'Up to 10 public HTTPS links, separated by commas',
	},
	{
		displayName: 'Input Data Field Names',
		name: 'binaryPropertyNames',
		type: 'string',
		required: true,
		default: 'data',
		placeholder: 'e.g. data, data_1',
		displayOptions: {
			show: { resource: ['post'], operation: ['create'], mediaSource: ['binary'] },
		},
		description:
			'Names of the input fields that hold the files, separated by commas. Supported: JPEG, PNG, GIF, WebP, TIFF and AVIF images, MP4, MOV and WebM videos.',
	},
	{
		displayName: 'Additional Fields',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: { show: { resource: ['post'], operation: ['create'] } },
		options: [
			{
				displayName: 'First Comment',
				name: 'firstComment',
				type: 'string',
				typeOptions: { rows: 2 },
				default: '',
				description:
					'A comment Publora posts under your post right after it is published. Supported on LinkedIn, X, Threads, Bluesky and Mastodon.',
			},
			{
				displayName: 'Instagram Video Type',
				name: 'instagramVideoType',
				type: 'options',
				default: 'REELS',
				options: [
					{ name: 'Reels', value: 'REELS' },
					{ name: 'Stories', value: 'STORIES' },
				],
				description: 'How Instagram publishes a video',
			},
			{
				displayName: 'Telegram Silent Message',
				name: 'telegramDisableNotification',
				type: 'boolean',
				default: false,
				description: 'Whether subscribers get the message without a notification sound',
			},
			{
				displayName: 'Threads Who Can Reply',
				name: 'threadsReplyControl',
				type: 'options',
				default: '',
				options: [
					{ name: 'Accounts You Follow', value: 'accounts_you_follow' },
					{ name: 'Default', value: '' },
					{ name: 'Everyone', value: 'everyone' },
					{ name: 'Mentioned Accounts Only', value: 'mentioned_only' },
				],
				description: 'Who can reply to the post on Threads',
			},
			{
				displayName: 'TikTok Who Can View',
				name: 'tiktokViewerSetting',
				type: 'options',
				default: 'PUBLIC_TO_EVERYONE',
				options: [
					{ name: 'Everyone', value: 'PUBLIC_TO_EVERYONE' },
					{ name: 'Followers', value: 'FOLLOWER_OF_CREATOR' },
					{ name: 'Friends', value: 'MUTUAL_FOLLOW_FRIENDS' },
					{ name: 'Only Me', value: 'SELF_ONLY' },
				],
				description:
					'Who can view the video on TikTok. A private TikTok account only allows Only Me.',
			},
			{
				displayName: 'X Quote Post',
				name: 'twitterQuoteTweet',
				type: 'string',
				default: '',
				placeholder: 'e.g. https://x.com/user/status/1234567890123456789',
				description: 'Link to an X post to quote, or its numeric ID',
			},
			{
				displayName: 'X Reply To',
				name: 'twitterReplyTo',
				type: 'string',
				default: '',
				placeholder: 'e.g. https://x.com/user/status/1234567890123456789',
				description:
					'Link to an X post to reply to, or its numeric ID. X only allows replies to posts that mention your account or that you wrote.',
			},
			{
				displayName: 'YouTube Privacy',
				name: 'youtubePrivacy',
				type: 'options',
				default: 'public',
				options: [
					{ name: 'Private', value: 'private' },
					{ name: 'Public', value: 'public' },
					{ name: 'Unlisted', value: 'unlisted' },
				],
				description: 'Who can watch the video on YouTube',
			},
			{
				displayName: 'YouTube Tags',
				name: 'youtubeTags',
				type: 'string',
				default: '',
				placeholder: 'e.g. tutorial, automation',
				description: 'Tags for the video, separated by commas',
			},
			{
				displayName: 'YouTube Title',
				name: 'youtubeTitle',
				type: 'string',
				default: '',
				description: 'Title of the video. If empty, the start of the post text is used.',
			},
		],
	},

	/* ------------------------------------------------------------------ */
	/*                    post:get / update / delete                      */
	/* ------------------------------------------------------------------ */
	{
		...postIdLocator,
		displayOptions: { show: { resource: ['post'], operation: ['get', 'update', 'delete'] } },
	},
	{
		displayName: 'Simplify',
		name: 'simplify',
		type: 'boolean',
		default: true,
		displayOptions: { show: { resource: ['post'], operation: ['get', 'getAll'] } },
		description: 'Whether to return a simplified version of the response instead of the raw data',
	},

	/* ------------------------------------------------------------------ */
	/*                               post:getAll                          */
	/* ------------------------------------------------------------------ */
	{
		displayName: 'Return All',
		name: 'returnAll',
		type: 'boolean',
		default: false,
		displayOptions: { show: { resource: ['post'], operation: ['getAll'] } },
		description: 'Whether to return all results or only up to a given limit',
	},
	{
		displayName: 'Limit',
		name: 'limit',
		type: 'number',
		typeOptions: { minValue: 1 },
		default: 50,
		displayOptions: { show: { resource: ['post'], operation: ['getAll'], returnAll: [false] } },
		description: 'Max number of results to return',
	},
	{
		displayName: 'Filters',
		name: 'filters',
		type: 'collection',
		placeholder: 'Add Filter',
		default: {},
		displayOptions: { show: { resource: ['post'], operation: ['getAll'] } },
		options: [
			{
				displayName: 'Network',
				name: 'platform',
				type: 'options',
				default: 'linkedin',
				options: [
					{ name: 'Bluesky', value: 'bluesky' },
					{ name: 'Facebook', value: 'facebook' },
					{ name: 'Instagram', value: 'instagram' },
					{ name: 'LinkedIn', value: 'linkedin' },
					{ name: 'Mastodon', value: 'mastodon' },
					{ name: 'Telegram', value: 'telegram' },
					{ name: 'Threads', value: 'threads' },
					{ name: 'TikTok', value: 'tiktok' },
					{ name: 'X', value: 'twitter' },
					{ name: 'YouTube', value: 'youtube' },
				],
				description: 'Only posts that go to this network',
			},
			{
				displayName: 'Scheduled After',
				name: 'fromDate',
				type: 'dateTime',
				default: '',
				description: 'Only posts scheduled at or after this time. Drafts are left out.',
			},
			{
				displayName: 'Scheduled Before',
				name: 'toDate',
				type: 'dateTime',
				default: '',
				description: 'Only posts scheduled at or before this time. Drafts are left out.',
			},
			{
				displayName: 'Status',
				name: 'status',
				type: 'options',
				default: 'scheduled',
				options: [
					{ name: 'Draft', value: 'draft' },
					{ name: 'Failed', value: 'failed' },
					{ name: 'Partially Published', value: 'partially_published' },
					{ name: 'Published', value: 'published' },
					{ name: 'Scheduled', value: 'scheduled' },
				],
			},
		],
	},

	/* ------------------------------------------------------------------ */
	/*                               post:update                          */
	/* ------------------------------------------------------------------ */
	{
		displayName: 'Update Fields',
		name: 'updateFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: { show: { resource: ['post'], operation: ['update'] } },
		options: [
			{
				displayName: 'Account Names or IDs',
				name: 'accountIds',
				type: 'multiOptions',
				typeOptions: { loadOptionsMethod: 'getAccounts' },
				default: [],
				description:
					'Choose from the list, or specify IDs using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
			},
			{
				displayName: 'Add Media URLs',
				name: 'mediaUrls',
				type: 'string',
				default: '',
				placeholder: 'e.g. https://example.com/photo.jpg',
				description:
					'Public HTTPS links to add to the post, separated by commas. Existing media stays.',
			},
			{
				displayName: 'First Comment',
				name: 'firstComment',
				type: 'string',
				typeOptions: { rows: 2 },
				default: '',
				description: 'Replaces the first comment. Leave the field out to keep the current one.',
			},
			{
				displayName: 'Publish At',
				name: 'scheduledTime',
				type: 'dateTime',
				default: '',
				description: 'New publish date and time. Also schedules a draft.',
			},
			{
				displayName: 'Publish Now',
				name: 'publishNow',
				type: 'boolean',
				default: false,
				description: 'Whether to publish the post right away',
			},
			{
				displayName: 'Status',
				name: 'status',
				type: 'options',
				default: 'draft',
				options: [
					{ name: 'Draft', value: 'draft' },
					{ name: 'Scheduled', value: 'scheduled' },
				],
				description: 'Move the post back to draft, or schedule it',
			},
			{
				displayName: 'Text',
				name: 'text',
				type: 'string',
				typeOptions: { rows: 4 },
				default: '',
				description: 'New text of the post',
			},
		],
	},
];

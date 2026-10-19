import type { INodeProperties } from 'n8n-workflow';

export const mediaOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['media'] } },
		options: [
			{
				name: 'Upload',
				value: 'upload',
				description: 'Upload a file from the input and attach it to a post',
				action: 'Upload media to a post',
			},
		],
		default: 'upload',
	},
];

export const mediaFields: INodeProperties[] = [
	{
		displayName: 'Post',
		name: 'postId',
		type: 'resourceLocator',
		default: { mode: 'list', value: '' },
		required: true,
		displayOptions: { show: { resource: ['media'], operation: ['upload'] } },
		description:
			'The draft or scheduled post to attach the file to. Attaching a file moves a scheduled post back to draft; schedule it again with Post → Update.',
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
	},
	{
		displayName: 'Input Data Field Name',
		name: 'binaryPropertyName',
		type: 'string',
		required: true,
		default: 'data',
		displayOptions: { show: { resource: ['media'], operation: ['upload'] } },
		description:
			'Name of the input field that holds the file. Supported: JPEG, PNG, GIF, WebP, TIFF and AVIF images, MP4, MOV and WebM videos, and PDF.',
	},
];

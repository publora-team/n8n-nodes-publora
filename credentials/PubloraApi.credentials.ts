import type {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	Icon,
	INodeProperties,
} from 'n8n-workflow';

export class PubloraApi implements ICredentialType {
	name = 'publoraApi';

	displayName = 'Publora API';

	icon: Icon = {
		light: 'file:../nodes/Publora/publora.svg',
		dark: 'file:../nodes/Publora/publora.dark.svg',
	};

	documentationUrl = 'https://docs.publora.com/authentication';

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			required: true,
			default: '',
			placeholder: 'e.g. sk_mrmbzomn_1a2b3c4d.964793af…',
			description:
				'Your Publora API key. In Publora, open API in the sidebar and click Generate API Key. The key is shown only once.',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				'x-publora-key': '={{$credentials.apiKey}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: 'https://api.publora.com/api/v1',
			url: '/platform-connections',
			method: 'GET',
		},
	};
}

import type {
	IDataObject,
	IExecuteFunctions,
	IHookFunctions,
	IHttpRequestMethods,
	IHttpRequestOptions,
	ILoadOptionsFunctions,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError } from 'n8n-workflow';

export const PUBLORA_API_BASE_URL = 'https://api.publora.com/api/v1';

type PubloraContext = IExecuteFunctions | ILoadOptionsFunctions | IHookFunctions;

/** Platforms whose posts must carry an image or a video. */
export const MEDIA_REQUIRED_PLATFORMS = ['instagram', 'tiktok', 'youtube'];

export const PLATFORM_LABELS: Record<string, string> = {
	bluesky: 'Bluesky',
	facebook: 'Facebook',
	instagram: 'Instagram',
	linkedin: 'LinkedIn',
	mastodon: 'Mastodon',
	pinterest: 'Pinterest',
	telegram: 'Telegram',
	threads: 'Threads',
	tiktok: 'TikTok',
	twitter: 'X',
	youtube: 'YouTube',
};

export function platformOf(connectionId: string): string {
	return String(connectionId).split('-')[0];
}

/**
 * Calls the Publora REST API with the node's credentials.
 * Every request is tagged with `x-publora-client: n8n` so Publora can tell
 * n8n traffic apart from other clients.
 */
export async function publoraApiRequest(
	this: PubloraContext,
	method: IHttpRequestMethods,
	endpoint: string,
	body?: IDataObject,
	qs?: IDataObject,
	headers?: IDataObject,
): Promise<IDataObject> {
	const options: IHttpRequestOptions = {
		method,
		url: `${PUBLORA_API_BASE_URL}${endpoint}`,
		json: true,
		headers: {
			Accept: 'application/json',
			'x-publora-client': 'n8n',
			...(headers ?? {}),
		},
	};
	if (body !== undefined) options.body = body;
	if (qs !== undefined && Object.keys(qs).length) options.qs = qs;

	try {
		return (await this.helpers.httpRequestWithAuthentication.call(
			this,
			'publoraApi',
			options,
		)) as IDataObject;
	} catch (error) {
		throw toPubloraApiError.call(this, error);
	}
}

/** Reads every page of `GET /list-posts`, or stops once `limit` posts are collected. */
export async function publoraListPosts(
	this: IExecuteFunctions | ILoadOptionsFunctions,
	query: IDataObject,
	limit?: number,
): Promise<IDataObject[]> {
	const posts: IDataObject[] = [];
	let page = 1;
	for (;;) {
		const pageSize = limit === undefined ? 100 : Math.min(100, Math.max(1, limit - posts.length));
		const response = await publoraApiRequest.call(this, 'GET', '/list-posts', undefined, {
			...query,
			page,
			limit: pageSize,
		});
		const batch = (response.posts as IDataObject[] | undefined) ?? [];
		posts.push(...batch);
		const pagination = (response.pagination as IDataObject | undefined) ?? {};
		if (limit !== undefined && posts.length >= limit) return posts.slice(0, limit);
		if (!pagination.hasNextPage || batch.length === 0) return posts;
		page++;
	}
}

/**
 * Turns a Publora error body into a readable n8n error: the API's own message
 * first, then the stable `code`, per-platform validation messages and, for plan
 * limits, the human-readable explanation Publora sends in `message`.
 */
function toPubloraApiError(this: PubloraContext, error: unknown): NodeApiError {
	type HttpLike = {
		message?: string;
		httpCode?: string;
		statusCode?: number;
		response?: { body?: unknown; data?: unknown; status?: number; statusCode?: number };
		cause?: HttpLike;
		errorResponse?: HttpLike;
	};
	// n8n's HTTP helpers may already wrap the failure in a NodeApiError with a
	// generic message; the response body Publora sent is kept on the original error.
	const err = error as HttpLike;
	const sources: HttpLike[] = [err, err.cause, err.errorResponse, err.cause?.cause].filter(
		(s): s is HttpLike => !!s && typeof s === 'object',
	);
	let body: unknown;
	let status: number | undefined;
	for (const s of sources) {
		body = body ?? s.response?.data ?? s.response?.body;
		status = status ?? s.response?.status ?? s.response?.statusCode ?? s.statusCode;
	}
	if (status === undefined && err.httpCode) status = Number(err.httpCode);
	if (typeof body === 'string') {
		try {
			body = JSON.parse(body);
		} catch {
			body = { error: body };
		}
	}
	if (!body || typeof body !== 'object') {
		return error instanceof NodeApiError
			? error
			: new NodeApiError(this.getNode(), error as JsonObject);
	}

	const data = body as IDataObject;
	const validation = data.validation as IDataObject | undefined;
	const validationErrors = ((validation?.errors as IDataObject[] | undefined) ?? [])
		.map((e) =>
			e.platform
				? `${PLATFORM_LABELS[e.platform as string] ?? e.platform}: ${e.message}`
				: e.message,
		)
		.filter(Boolean);
	const mediaResults = ((data.mediaResults as IDataObject[] | undefined) ?? [])
		.filter((m) => m.code || m.error)
		.map((m) => `${m.url ?? 'media'}: ${m.message ?? m.error ?? m.code}`);

	const headline =
		validationErrors.length > 0
			? validationErrors.join('; ')
			: ((data.message as string | undefined) ??
				(data.error as string | undefined) ??
				err.message ??
				'Publora request failed');

	const details: string[] = [];
	if (data.code) details.push(`Code: ${data.code}`);
	if (validationErrors.length > 0 && data.error) details.push(String(data.error));
	if (data.message && data.error && data.message !== headline) details.push(String(data.error));
	if (mediaResults.length) details.push(mediaResults.join('; '));
	if (data.field) details.push(`Field: ${data.field}`);
	if (status === 401) details.push('Check the API key in the Publora credential.');
	if (
		data.code === 'POST_LIMIT_REACHED' ||
		data.code === 'SCHEDULED_POST_LIMIT_REACHED' ||
		data.code === 'SCHEDULE_HORIZON_REACHED'
	) {
		details.push('See plan limits at https://publora.com/pricing');
	}

	return new NodeApiError(this.getNode(), data as JsonObject, {
		message: headline,
		description: details.length ? details.join(' · ') : undefined,
		httpCode: status !== undefined ? String(status) : err.httpCode,
	});
}

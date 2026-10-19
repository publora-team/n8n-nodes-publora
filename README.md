# @publora/n8n-nodes-publora

This is the official n8n community node for [Publora](https://publora.com). It lets you publish and schedule social media posts from your n8n workflows, and start workflows when a post is published, scheduled, fails, or returns to draft.

Publora publishes to LinkedIn, X, Instagram, Threads, TikTok, YouTube, Facebook, Bluesky, Mastodon and Telegram from one place. You connect your social accounts in Publora once, and the node posts to any of them.

[n8n](https://n8n.io/) is a [fair-code licensed](https://docs.n8n.io/sustainable-use-license/) workflow automation platform.

[Installation](#installation) · [Operations](#operations) · [Credentials](#credentials) · [Compatibility](#compatibility) · [Usage](#usage) · [Resources](#resources) · [Version history](#version-history)

## Installation

Follow the [installation guide](https://docs.n8n.io/integrations/community-nodes/installation/) in the n8n community nodes documentation and install `@publora/n8n-nodes-publora`.

## Operations

The package has two nodes.

### Publora

**Post**

- **Create**: publish now, schedule for a date and time, or save as a draft. Attach images or a video from public URLs or from files produced by earlier nodes (for example Google Drive or HTTP Request). Optional first comment and network settings (Instagram video type, TikTok audience, YouTube title, privacy and tags, Threads reply control, X reply and quote, silent Telegram message).
- **Delete**: delete a draft or scheduled post.
- **Get**: get a post and its status on each network, with the live post ID once it is published.
- **Get Many**: list posts, filtered by status, network and scheduled date.
- **Update**: change the text, the accounts, the publish time or the status of a draft or scheduled post, add media from URLs, replace the first comment, or publish it now.

**Media**

- **Upload**: upload a file from the input to a draft or scheduled post.

**Account**

- **Get Many**: list the social accounts connected to Publora, with their connection status.

The Publora node can be used as a tool by n8n AI agents.

### Publora Trigger

Starts the workflow when a post is published, scheduled, fails to publish, or returns to draft. The node subscribes to Publora when the workflow is activated and removes the subscription when it is deactivated. Every event is checked against the subscription's signing secret, and requests without a valid signature are rejected.

## Credentials

You need a Publora account and an API key. A free plan is available.

1. Sign up at [publora.com](https://publora.com) and connect your social accounts under **Channels**.
2. Open **API** in the Publora sidebar and click **Generate API Key**. Copy the key right away: it is shown only once.
3. In n8n, create a **Publora API** credential and paste the key. The credential test lists your connected accounts to check the key.

If the key is wrong or has been revoked, the credential test reports `Unauthorized`.

## Compatibility

Tested with n8n 2.43.8.

## Usage

**Posting with media.** Instagram, TikTok and YouTube posts need an image or a video. With **Media → Files From Input**, the node creates the post as a draft, uploads each file, and then schedules or publishes it. If an upload fails, the node deletes the unfinished post, so nothing half-made is left in Publora.

**Times.** **Publish At** uses the workflow's time zone. Publora stores times in UTC.

**Retries.** The node sends an idempotency key with every create and update, so if n8n retries a step, Publora returns the first result instead of creating a second post.

**Plan limits.** The free plan allows 15 posts a month, 3 scheduled posts at a time, scheduling up to 7 days ahead, and doesn't include X. When a limit is reached, the node shows Publora's message with the limit that was hit. See [pricing](https://publora.com/pricing).

**Publora Trigger and your n8n address.** Publora sends events only to public addresses. If your n8n runs on localhost or in a private network, set `N8N_WEBHOOK_URL` (or `WEBHOOK_URL` on older versions) to a public URL, or use a tunnel. Each Publora account can have up to 10 webhooks; every active workflow with a Publora Trigger uses one.

**Example: post new blog articles.** RSS Feed Trigger → Publora (Post → Create, Publish: Now, Text: `{{ $json.title }} {{ $json.link }}`).

**Example: schedule from a content plan.** Google Sheets (rows marked ready) → Publora (Post → Create, Publish: Schedule, Publish At: the row's date) → Google Sheets (write back the post ID).

**Example: alert on failed posts.** Publora Trigger (Post Failed) → Slack or email with the network and the error message.

## Resources

- [n8n community nodes documentation](https://docs.n8n.io/integrations/#community-nodes)
- [Publora API documentation](https://docs.publora.com)
- [Publora webhooks](https://docs.publora.com/endpoints/webhooks)
- [Support](mailto:support@publora.com)

## Version history

### 0.1.0

First release: Post (Create, Delete, Get, Get Many, Update), Media (Upload), Account (Get Many), and the Publora Trigger.

// Google Drive MCP tools for Verdent AI
import { MCPContext, MCPResponse } from './types';

export const gdriveTools = [
  {
    name: 'gdrive_list_files',
    description: 'List files in Google Drive',
    inputSchema: { type: 'object', properties: { folderId: { type: 'string' }, query: { type: 'string' }, pageSize: { type: 'number', default: 20 } } },
    handler: async (args: any, ctx: MCPContext) => {
      const creds = ctx.userApiKeys['GOOGLE_SERVICE_ACCOUNT'];
      if (!creds) return { content: [{ type: 'text', text: 'Google Drive not configured' }], isError: true };
      try {
        const { client_email, private_key } = JSON.parse(creds);
        const jwt = await getGoogleJWT(client_email, private_key, 'https://www.googleapis.com/auth/drive.readonly');
        const folderQuery = args.folderId ? ` and '${args.folderId}' in parents` : '';
        const q = args.query || `trashed=false${folderQuery}`;
        const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&pageSize=${args.pageSize || 20}&fields=files(id,name,mimeType,modifiedTime,webViewLink)`;
        const res = await fetch(url, { headers: { Authorization: `Bearer ${jwt}` } });
        const data = await res.json();
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
      } catch (e: any) {
        return { content: [{ type: 'text', text: `Error: ${e.message}` }], isError: true };
      }
    },
  },
  {
    name: 'gdrive_get_file',
    description: 'Get file metadata from Google Drive',
    inputSchema: { type: 'object', properties: { fileId: { type: 'string' } }, required: ['fileId'] },
    handler: async (args: any, ctx: MCPContext) => {
      const creds = ctx.userApiKeys['GOOGLE_SERVICE_ACCOUNT'];
      if (!creds) return { content: [{ type: 'text', text: 'Google Drive not configured' }], isError: true };
      const { client_email, private_key } = JSON.parse(creds);
      const jwt = await getGoogleJWT(client_email, private_key, 'https://www.googleapis.com/auth/drive.readonly');
      const res = await fetch(`https://www.googleapis.com/drive/v3/files/${args.fileId}?fields=id,name,mimeType,modifiedTime,webViewLink`, {
        headers: { Authorization: `Bearer ${jwt}` },
      });
      const data = await res.json();
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    },
  },
  {
    name: 'gdrive_create_folder',
    description: 'Create a folder in Google Drive',
    inputSchema: { type: 'object', properties: { name: { type: 'string' }, parentId: { type: 'string' } }, required: ['name'] },
    handler: async (args: any, ctx: MCPContext) => {
      const creds = ctx.userApiKeys['GOOGLE_SERVICE_ACCOUNT'];
      if (!creds) return { content: [{ type: 'text', text: 'Google Drive not configured' }], isError: true };
      const { client_email, private_key } = JSON.parse(creds);
      const jwt = await getGoogleJWT(client_email, private_key, 'https://www.googleapis.com/auth/drive');
      const body: any = { name: args.name, mimeType: 'application/vnd.google-apps.folder' };
      if (args.parentId) body.parents = [args.parentId];
      const res = await fetch('https://www.googleapis.com/drive/v3/files', {
        method: 'POST', headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }], isError: !data.id };
    },
  },
  {
    name: 'gdrive_upload_content',
    description: 'Upload content to a Google Drive folder',
    inputSchema: { type: 'object', properties: { name: { type: 'string' }, content: { type: 'string' }, parentId: { type: 'string' }, mimeType: { type: 'string' } }, required: ['name', 'content'] },
    handler: async (args: any, ctx: MCPContext) => {
      const creds = ctx.userApiKeys['GOOGLE_SERVICE_ACCOUNT'];
      if (!creds) return { content: [{ type: 'text', text: 'Google Drive not configured' }], isError: true };
      const { client_email, private_key } = JSON.parse(creds);
      const jwt = await getGoogleJWT(client_email, private_key, 'https://www.googleapis.com/auth/drive');
      const metadata: any = { name: args.name };
      if (args.parentId) metadata.parents = [args.parentId];
      if (args.mimeType) metadata.mimeType = args.mimeType;
      const boundary = 'VERDENT_BOUNDARY';
      const encoded = new TextEncoder().encode(
        `--${boundary}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: text/plain\r\n\r\n${args.content}\r\n--${boundary}--`
      );
      const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST', headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': `multipart/related; boundary=${boundary}` }, body: encoded,
      });
      const data = await res.json();
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }], isError: !data.id };
    },
  },
  {
    name: 'gdrive_export_file',
    description: 'Export a Google Doc/Sheet as a specific format',
    inputSchema: { type: 'object', properties: { fileId: { type: 'string' }, mimeType: { type: 'string' } }, required: ['fileId', 'mimeType'] },
    handler: async (args: any, ctx: MCPContext) => {
      const creds = ctx.userApiKeys['GOOGLE_SERVICE_ACCOUNT'];
      if (!creds) return { content: [{ type: 'text', text: 'Google Drive not configured' }], isError: true };
      const { client_email, private_key } = JSON.parse(creds);
      const jwt = await getGoogleJWT(client_email, private_key, 'https://www.googleapis.com/auth/drive.readonly');
      const res = await fetch(`https://www.googleapis.com/drive/v3/files/${args.fileId}/export?mimeType=${encodeURIComponent(args.mimeType)}`, {
        headers: { Authorization: `Bearer ${jwt}` },
      });
      const data = await res.text();
      return { content: [{ type: 'text', text: data }] };
    },
  },
];

async function getGoogleJWT(clientEmail: string, privateKey: string, scope: string): Promise<string> {
  const crypto = await import('crypto');
  const jwtIat = Math.floor(Date.now() / 1000);
  const jwtExp = jwtIat + 3600;
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    iss: clientEmail, sub: clientEmail, aud: 'https://oauth2.googleapis.com/token', iat: jwtIat, exp: jwtExp, scope,
  })).toString('base64url');
  const signature = crypto.createSign('RSA-SHA256').update(`${header}.${payload}`).sign(privateKey, 'base64url');
  const token = `${header}.${payload}.${signature}`;
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${token}`,
  });
  const data = await res.json();
  return data.access_token;
}

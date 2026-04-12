# Settings Page for Spiktor
import 'use client';

import { useState } from 'react';
import { Key, Slack, Github, Database, Globe, Box, Zap, Save, RotateCcw } from 'lucide-react';

interface Secrets {
  geminiApiKey: string;
  ollamaBaseUrl: string;
  slackBotToken: string;
  slackSigningSecret: string;
  githubToken: string;
  notionApiKey: string;
  linearApiKey: string;
  browserbaseKey: string;
  openMemoryUrl: string;
  nexusUrl: string;
  n8nUrl: string;
  gobiiUrl: string;
}

const defaults: Secrets = {
  geminiApiKey: '',
  ollamaBaseUrl: 'http://localhost:11434',
  slackBotToken: '',
  slackSigningSecret: '',
  githubToken: '',
  notionApiKey: '',
  linearApiKey: '',
  browserbaseKey: '',
  openMemoryUrl: 'http://localhost:8080',
  nexusUrl: 'http://localhost:4000',
  n8nUrl: 'http://localhost:5678',
  gobiiUrl: 'http://localhost:8000',
};

const sections = [
  {
    title: 'AI Models',
    icon: Zap,
    fields: [
      { key: 'geminiApiKey', label: 'Gemini API Key', placeholder: 'AIza...', type: 'password' },
      { key: 'ollamaBaseUrl', label: 'Ollama URL', placeholder: 'http://localhost:11434', type: 'text' },
    ],
  },
  {
    title: 'Slack',
    icon: Slack,
    fields: [
      { key: 'slackBotToken', label: 'Bot Token', placeholder: 'xoxb-...', type: 'password' },
      { key: 'slackSigningSecret', label: 'Signing Secret', placeholder: '...', type: 'password' },
    ],
  },
  {
    title: 'GitHub',
    icon: Github,
    fields: [
      { key: 'githubToken', label: 'Personal Access Token', placeholder: 'ghp_...', type: 'password' },
    ],
  },
  {
    title: 'Notion',
    icon: Globe,
    fields: [
      { key: 'notionApiKey', label: 'Integration Token', placeholder: 'secret_...', type: 'password' },
    ],
  },
  {
    title: 'Linear',
    icon: Database,
    fields: [
      { key: 'linearApiKey', label: 'API Key', placeholder: 'lin_...', type: 'password' },
    ],
  },
  {
    title: 'Memory & Knowledge',
    icon: Box,
    fields: [
      { key: 'browserbaseKey', label: 'Browserbase Key', placeholder: '...', type: 'password' },
      { key: 'openMemoryUrl', label: 'OpenMemory URL', placeholder: 'http://localhost:8080', type: 'text' },
      { key: 'nexusUrl', label: 'Nexus URL', placeholder: 'http://localhost:4000', type: 'text' },
    ],
  },
  {
    title: 'Automation',
    icon: Zap,
    fields: [
      { key: 'n8nUrl', label: 'n8n URL', placeholder: 'http://localhost:5678', type: 'text' },
      { key: 'gobiiUrl', label: 'Gobii URL', placeholder: 'http://localhost:8000', type: 'text' },
    ],
  },
];

export default function SettingsPage() {
  const [secrets, setSecrets] = useState<Secrets>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('spiktor_secrets');
      return saved ? { ...defaults, ...JSON.parse(saved) } : defaults;
    }
    return defaults;
  });
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    localStorage.setItem('spiktor_secrets', JSON.stringify(secrets));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleReset = () => {
    setSecrets(defaults);
    localStorage.removeItem('spiktor_secrets');
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-6 max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3 mb-8">
        <Key className="w-8 h-8 text-emerald-400" />
        <div>
          <h1 className="text-2xl font-bold">Spiktor Settings</h1>
          <p className="text-zinc-500 text-sm">Configure your API keys and integrations</p>
        </div>
      </div>

      {sections.map((section) => {
        const Icon = section.icon;
        return (
          <div key={section.title} className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
            <div className="flex items-center gap-2 text-zinc-300 font-semibold">
              <Icon className="w-4 h-4 text-emerald-400" />
              {section.title}
            </div>
            {section.fields.map((field) => (
              <div key={field.key}>
                <label className="block text-xs text-zinc-500 mb-1 uppercase tracking-wider">{field.label}</label>
                <input
                  type={field.type}
                  value={(secrets as any)[field.key]}
                  onChange={(e) => setSecrets({ ...secrets, [field.key]: e.target.value })}
                  placeholder={field.placeholder}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm font-mono text-emerald-400 focus:outline-none focus:border-emerald-500/50"
                />
              </div>
            ))}
          </div>
        );
      })}

      <div className="flex gap-3 pt-2">
        <button
          onClick={handleSave}
          className="flex-1 flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-3 rounded-xl transition-colors"
        >
          <Save className="w-4 h-4" />
          {saved ? '✓ Saved!' : 'Save Settings'}
        </button>
        <button
          onClick={handleReset}
          className="flex items-center gap-2 px-4 py-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 font-medium rounded-xl transition-colors"
        >
          <RotateCcw className="w-4 h-4" />
          Reset
        </button>
      </div>
    </div>
  );
}

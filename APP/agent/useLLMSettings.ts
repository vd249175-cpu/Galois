import { useState, useEffect } from 'react';

export function useLLMSettings() {
  const [provider, setProvider] = useState<string>('ollama');
  const [apiKey, setApiKey] = useState<string>('');
  const [baseURL, setBaseURL] = useState<string>('http://localhost:11434/v1');
  const [model, setModel] = useState<string>('llama3');
  const [showSettings, setShowSettings] = useState<boolean>(false);

  // Initialize LLM Settings from localStorage
  useEffect(() => {
    const savedProvider = localStorage.getItem('dnote_agent_provider');
    if (savedProvider) setProvider(savedProvider);

    const savedApiKey = localStorage.getItem('dnote_agent_api_key');
    if (savedApiKey) setApiKey(savedApiKey);

    const savedBaseURL = localStorage.getItem('dnote_agent_base_url');
    if (savedBaseURL) setBaseURL(savedBaseURL);

    const savedModel = localStorage.getItem('dnote_agent_model');
    if (savedModel) setModel(savedModel);
  }, []);

  // Settings modification savers
  const saveSetting = (key: string, val: string, setter: (v: string) => void) => {
    setter(val);
    localStorage.setItem(key, val);
  };

  return {
    provider,
    setProvider,
    apiKey,
    setApiKey,
    baseURL,
    setBaseURL,
    model,
    setModel,
    showSettings,
    setShowSettings,
    saveSetting,
  };
}

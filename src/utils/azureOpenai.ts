import { AzureOpenAI } from "openai";

// Azure OpenAI configuration
const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
const deployment = process.env.AZURE_OPENAI_DEPLOYMENT;
const modelName = process.env.AZURE_OPENAI_MODEL_NAME;
const apiKey = process.env.AZURE_OPENAI_API_KEY;
const apiVersion = process.env.AZURE_OPENAI_API_VERSION || "2024-04-01-preview";

// Create Azure OpenAI client
const azureOpenAIClient = new AzureOpenAI({
  endpoint: endpoint as string,
  apiKey: apiKey as string,
  deployment: deployment as string,
  apiVersion: apiVersion,
});

export default azureOpenAIClient; 
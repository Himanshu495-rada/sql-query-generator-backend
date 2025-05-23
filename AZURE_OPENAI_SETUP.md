# Azure OpenAI Setup Guide

This guide explains how to set up your environment to use Azure OpenAI with the SQL Playground.

## Environment Variables

Add the following variables to your `.env` file:

```
# Azure OpenAI Configuration
USE_AZURE_OPENAI=true
AZURE_OPENAI_ENDPOINT=https://your-resource-name.openai.azure.com/
AZURE_OPENAI_API_KEY=your-azure-openai-api-key
AZURE_OPENAI_DEPLOYMENT=gpt-4o-mini  # deployment name in Azure
AZURE_OPENAI_MODEL_NAME=gpt-4o-mini  # model name
AZURE_OPENAI_API_VERSION=2024-04-01-preview
```

## Configuration Details

- `USE_AZURE_OPENAI`: Set to 'true' to use Azure OpenAI instead of regular OpenAI
- `AZURE_OPENAI_ENDPOINT`: Your Azure OpenAI resource endpoint (e.g., "https://your-resource-name.openai.azure.com/")
- `AZURE_OPENAI_API_KEY`: Your Azure OpenAI API key
- `AZURE_OPENAI_DEPLOYMENT`: The deployment name you created in Azure OpenAI Studio
- `AZURE_OPENAI_MODEL_NAME`: The model name (e.g., gpt-4o-mini)
- `AZURE_OPENAI_API_VERSION`: API version (default: 2024-04-01-preview)

## Setting Up Azure OpenAI

1. Create an Azure OpenAI resource in the Azure portal
2. Deploy a model through Azure OpenAI Studio
3. Get the endpoint URL and API key from the Azure portal
4. Update your `.env` file with the values

## Testing

After updating your `.env` file, restart the backend server to apply the changes. Your application will now use Azure OpenAI for SQL query generation.

## Switching Between OpenAI and Azure OpenAI

You can switch between standard OpenAI and Azure OpenAI by changing the `USE_AZURE_OPENAI` environment variable:

- Set to `true` to use Azure OpenAI
- Set to `false` (or remove) to use standard OpenAI 
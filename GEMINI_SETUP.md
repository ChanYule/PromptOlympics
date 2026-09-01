# Setting Up Gemini API for Prompt Olympics

## Problem
When you click "Generate My Story" in the Prompt Olympics app, you see the error:
> "Your story did not load - Gemini did not return a story this time."

This happens because the Gemini API is not configured or the API key is invalid.

## Solution

### Step 1: Get a Gemini API Key

1. Go to [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Click **"Create API Key"** or use an existing one
3. Copy the API key to your clipboard

> ⚠️ **Important**: Keep your API key private. It should only be used in the environment where the server runs, never in browser-side code.

### Step 2: Verify the API Key Works

Before configuring the app, verify your key works:

1. At [Google AI Studio](https://aistudio.google.com/), test a prompt to ensure your API key has access to Gemini models
2. If you see an error like "API key invalid" or "quota exceeded," you may need to:
   - Create a new key
   - Enable the Generative AI API in your Google Cloud project
   - Check your project's usage quota

### Step 3: Configure the App

#### Option A: Local Development (Recommended)

Run the app in a terminal with the API key:

```powershell
$env:GEMINI_API_KEY="your-api-key-here"
npm run build
npm start
```

Then visit `http://localhost:10000`

#### Option B: Deploy to Render (or other hosting)

1. Set the environment variable in your deployment platform:
   - For Render: Go to Environment → add `GEMINI_API_KEY` with your key value
2. Redeploy the app
3. The API key will only exist on the server, never exposed to users

#### Option C: Change the Model (Optional)

By default, the app uses `gemini-3.6-flash`. To set a model explicitly:

```powershell
$env:GEMINI_MODEL="gemini-3.6-flash"
$env:GEMINI_API_KEY="your-api-key-here"
npm start
```

Available models depend on your API key and quota. Common options:
- `gemini-3.6-flash`

### Step 4: Test It

Once configured:

1. Start the server as shown in Step 3
2. Open `http://localhost:10000`
3. Create a prompt and click "Generate My Story"
4. You should see a generated story instead of an error

## Troubleshooting

### Error: "Gemini is not configured on the server"
- The `GEMINI_API_KEY` environment variable is not set
- **Fix**: Set it before running `npm start` (see Step 3)

### Error: "Gemini model 'X' was not found"
- The model name is invalid or your key doesn't have access to it
- **Fix**: Try `gemini-pro` or check available models at [Google AI Studio](https://aistudio.google.com/app/apikey)

### Error: "Gemini rejected the API key"
- The API key is invalid or has expired
- **Fix**: Create a new key at [Google AI Studio](https://aistudio.google.com/app/apikey)

### Error: "Gemini is rate-limited"
- Your account has hit the free tier limits
- **Fix**: Wait a few hours or upgrade your Google Cloud account

## Testing the API

You can test if your setup works without using the full app:

```powershell
# Check server health
Invoke-WebRequest -Uri "http://localhost:10000/api/health" -UseBasicParsing | Select-Object -ExpandProperty Content

# Test Gemini API
$body = @{ prompt = "Say hello" } | ConvertTo-Json
Invoke-WebRequest -Uri "http://localhost:10000/api/test-gemini" -Method POST -ContentType "application/json" -Body $body -UseBasicParsing | Select-Object -ExpandProperty Content
```

Both should return JSON responses without errors.

## Security Notes

- **Never** commit your API key to version control
- **Never** expose your API key in client-side code (browser)
- **Always** set `GEMINI_API_KEY` as a server environment variable only
- For production: use a secrets manager like Render Environment Variables, AWS Secrets Manager, or similar

## More Help

- [Google Generative AI Documentation](https://ai.google.dev/)
- [Prompt Olympics README](./README.md)

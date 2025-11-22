// Metabase Static Embedding Service
import { SignJWT } from 'jose'

export interface MetabaseConfig {
  siteUrl: string
  secretKey: string
  questionId: number
  expirationMinutes?: number
  params?: Record<string, any>
}

/**
 * Generate a signed JWT token for Metabase static embedding
 */
export async function generateMetabaseEmbedUrl(config: MetabaseConfig): Promise<string> {
  const {
    siteUrl,
    secretKey,
    questionId,
    expirationMinutes = 10,
    params = {}
  } = config

  // Create the payload according to Metabase static embedding spec
  // Note: 'exp' should be set via setExpirationTime, not in payload
  const payload: any = {
    resource: { question: questionId }
  }
  
  // Only add params if they exist and are not empty
  if (params && Object.keys(params).length > 0) {
    payload.params = params
  }

  // Convert secret key to Uint8Array for jose
  const secretKeyBytes = new TextEncoder().encode(secretKey)

  // Calculate expiration time
  const expTime = Math.round(Date.now() / 1000) + (expirationMinutes * 60)

  // Sign the JWT token
  const token = await new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime(expTime)
    .setIssuedAt(Math.round(Date.now() / 1000))
    .sign(secretKeyBytes)
  
  console.log('Metabase JWT payload:', JSON.stringify(payload, null, 2))
  console.log('Metabase expiration time:', new Date(expTime * 1000).toISOString())

  // Construct the iframe URL
  // Ensure HTTPS if the current page is HTTPS (to avoid mixed content issues)
  let finalSiteUrl = siteUrl
  if (typeof window !== 'undefined' && window.location.protocol === 'https:' && siteUrl.startsWith('http://')) {
    // Try HTTPS version if available
    finalSiteUrl = siteUrl.replace('http://', 'https://')
  }
  
  const iframeUrl = `${finalSiteUrl}/embed/question/${token}#bordered=true&titled=true`

  return iframeUrl
}

/**
 * Get Metabase embed URL from environment variables
 */
export async function getMetabaseEmbedUrl(): Promise<string | null> {
  const siteUrl = import.meta.env.VITE_METABASE_SITE_URL
  const secretKey = import.meta.env.VITE_METABASE_SECRET_KEY
  const questionId = import.meta.env.VITE_METABASE_QUESTION_ID

  console.log('Metabase config check:', {
    hasSiteUrl: !!siteUrl,
    hasSecretKey: !!secretKey,
    hasQuestionId: !!questionId,
    siteUrl: siteUrl,
    questionId: questionId
  })

  if (!siteUrl || !secretKey || !questionId) {
    console.warn('Metabase environment variables missing:', {
      siteUrl: siteUrl || 'MISSING',
      secretKey: secretKey ? 'SET' : 'MISSING',
      questionId: questionId || 'MISSING'
    })
    return null
  }

  try {
    const url = await generateMetabaseEmbedUrl({
      siteUrl,
      secretKey,
      questionId: parseInt(questionId, 10),
      expirationMinutes: 10
    })
    console.log('Generated Metabase URL:', url.substring(0, 100) + '...')
    return url
  } catch (error) {
    console.error('Error generating Metabase embed URL:', error)
    return null
  }
}


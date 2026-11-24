package service

import "yingce/backend/internal/app"

type (
	OpenAPIGenerationRequest = app.OpenAPIGenerationRequest
	OpenAPIReference         = app.OpenAPIReference
)

type (
	OpenAPIGeneration       = app.OpenAPIGeneration
	OAuthError              = app.OAuthError
	OAuthClientRegistration = app.OAuthClientRegistration
	OAuthTokenResponse      = app.OAuthTokenResponse
	OAuthAuthorizeRequest   = app.OAuthAuthorizeRequest
)

const OAuthScope = app.OAuthScope

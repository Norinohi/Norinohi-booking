# .well-known

`apple-developer-merchantid-domain-association` is Stripe's Apple Pay domain-verification
file, served verbatim at `/.well-known/apple-developer-merchantid-domain-association`.
Apple fetches it over https when a domain is registered under Stripe's Payment method
domains, and Apple Pay stays hidden on any domain where the fetch fails — which is why it
lives in the repo rather than being uploaded to a host by hand: a deploy that dropped it
would silently remove the Apple Pay button.

The file is the same for every Stripe account (https://stripe.com/files/apple-pay/…), so it
carries no secret and needs no rotation. Each host serving the site must be registered
separately in Stripe, `www` included.

# Video provider check: Mux vs Cloudflare Stream

Checked 25 Nov 2026 from the providers' own public pages. This is not legal advice:
the "Questions for the lawyer" section is for the owner's lawyer.

## Summary

| | Mux | Cloudflare Stream |
|---|---|---|
| Video stored in Australia? | **No option found.** Privacy policy: "we must transfer your data to the U.S. and process it there." | **No.** Data Localization table: Stream is not compatible with Regional Services; "You cannot yet specify region location for object storage itself." |
| Uses your videos for its own purposes? | **Yes, in limited ways.** Terms §2.2 give Mux a worldwide licence to use customer videos to "maintain and improve our products and services". AI Services Addendum §3.2(b): Mux "may use Customer Data and Output, in each case that do not contain Personal Data or are or have been Anonymized, to train … any AI Model owned or controlled by Mux." The addendum "applies … by default". No opt-out found. | **Not stated for Stream.** The "does not reference or use any Customer Content except as needed to provide the Services" promise is in the Developer Platform section, which does not list Stream. The Stream section is silent on this. |
| AI vendors | Only when you use Mux AI features. Mux "contractually requires each AI Vendor to refrain from using Customer Data … to train". We will not use Mux AI features. | Not checked (we wouldn't use them). |
| Children | Mux privacy policy: its service isn't directed at under-13s. That's about Mux's own users, not our app's videos. | Not stated. |
| Deletion | Terms: data "may be permanently deleted" after termination. Deletion timing (including backups) is likely in the DPA, which couldn't be downloaded (rate-limited). | May delete content after a subscription ends; customer can access content up to 30 days after termination. Per-video deletion timing not found. |
| Private, expiring playback links | Yes (signed playback policies, with an expiry time). | Yes (signed URLs). |
| Cut clips from start/end times | Yes ("asset-based clips", "instant clips"). | Yes (clipping). |
| Resumable phone uploads | Yes (Direct Uploads + UpChunk). | Yes (tus). |
| Free tier | **Free plan: up to 10 videos stored**, 100K delivery minutes/month, no card needed. Enough for building and testing with sample videos. | No free storage; prepaid. |
| Prices (from their pages) | Input from free; storage from **US$0.0024 per minute per month**; delivery 100K minutes/month free, then from US$0.0008/min. Pay as you go includes US$20/month credit. | Storage **US$5 per 1,000 minutes/month** (prepaid); delivery US$1 per 1,000 minutes; upload and encoding free. |

**Rough cost per match (Mux, from the prices above):** two halves of about 50 minutes is 100 minutes,
so about US$0.24/month to store while the full video is kept (60 days), and much less for the clips after that.
Watching is free up to 100K minutes/month. Check the pricing page before relying on this.

## Recommendation

- **Build with Mux now**, on its **free plan, with sample videos only**. Nothing real is uploaded, so this is safe while the questions below are answered.
- **Before any real child's video is uploaded**, the owner (with the lawyer) decides, based on:
  1. Video will be stored **in the US**, not Australia (true for both providers).
  2. Mux's terms allow it to use customer content to improve its services, and to train its own AI on content that has **no personal data or has been anonymised**. Videos of identifiable children are personal data, but the "or have been Anonymized" wording needs a lawyer's view and ideally a written assurance from Mux.
- If Mux won't give that assurance, Cloudflare Stream is the alternative. Its terms need the same check (its Stream section is silent on content use), plus its DPA.

## Questions to send Mux (in writing)

1. Can video be stored and processed only in Australia, or in a specific region? If not, which countries?
2. Will Mux confirm in writing that our customer videos (which show children) will **never** be used to train, fine-tune or improve any AI model, **including after anonymisation**? Is there an opt-out from the AI Services Addendum?
3. When we delete an asset, how long until it is permanently deleted, including backups and from any sub-processors?
4. Please send the current sub-processor list with countries.

## Questions for the lawyer

1. Is storing children's match videos in the US acceptable under the Privacy Act and the Children's Online Privacy Code, and what must the consent wording say about it? (The current draft says: "Before video uploads are switched on, we'll tell you where videos are stored.")
2. Is Mux Terms §2.2 + AI Services Addendum §3.2(b) acceptable for children's footage, or do we need a signed DPA or opt-out?
3. Cloudflare's equivalent terms, if we switch.

## Not yet read

- The Mux Data Processing Addendum PDF (https://www.mux.com/files/mux-dpa.pdf): the site refused repeated downloads (rate limit). The owner can open it in a browser. It holds sub-processors (Exhibit 3), transfer terms and deletion details.
- Cloudflare's customer DPA.

## Sources

- https://www.mux.com/terms (§2.2 Rights to Data; AI Services Addendum §§2, 3.2)
- https://www.mux.com/privacy (§6.2.3 / data transfer to the U.S.; §9 Age Limitations)
- https://www.mux.com/pricing
- https://www.mux.com/docs/guides/secure-video-playback
- https://www.mux.com/docs/guides/create-clips-from-your-videos
- https://www.mux.com/docs/guides/upload-files-directly
- https://developers.cloudflare.com/data-localization/compatibility/
- https://www.cloudflare.com/service-specific-terms-developer-platform/
- https://developers.cloudflare.com/stream/pricing/

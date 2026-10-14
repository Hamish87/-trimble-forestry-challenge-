# CFHarvest evidence index

Everything public we found about Trimble CFHarvest (formerly WoodForce), implemented in Scandinavia by ForestX (Växjö/Göteborg, Sweden). Reviewed 14 October 2026. Each item says what it is good for. Save local copies under `evidence/` as you capture them (PDFs in `specs/`, frames in `screenshots/`, notes per video in `video-notes/`).

## A. Official documentation portal (ForestX) — primary source for the replica

The ForestX support site is an MkDocs portal in Swedish. These pages are the closest thing to a product manual that exists publicly.

| Page | URL | Use |
|---|---|---|
| Support landing (CFH) | https://docs.forestx.se/sv/cfh/support_cfh/ | Entry point; support hours, cfh.support@forestx.se, +46 31 55 53 00 |
| **Manual Webb** (planning app) | https://docs.forestx.se/sv/cfh/cfh_manualer/cfh_manual_webb/ | **Core source for the Planning replica.** Administration, resources, calendar, Uppdragslista, map, planning to resource/chain, orders. Summarised in `SPEC_PLANNING.md`. |
| Manual Maskin (on-board client) | https://docs.forestx.se/sv/cfh/cfh_manualer/cfh_manual_maskin/ | Interface between planning and machine: tabs, statuses, "Starta, överför till mätdon", HPR/FPR/HQC reporting, final evaluation |
| Manual Mobil (field app) | https://docs.forestx.se/sv/cfh/cfh_manualer/cfh_manual_mobil/ | Field-operation app; later milestone |
| Inställningar & installation | https://docs.forestx.se/sv/cfh/cfh_manualer/inst%C3%A4llningar_installation/ | Machine client settings; folder mapping (SenderXC), GPS |
| Viktiga steg (getting started) | https://docs.forestx.se/sv/cfh/cfh_viktiga_steg/ | The ordered onboarding workflow: resources → production data → weekly hours → users/roles → machine client → PIN/OIN → HPR |
| Vanliga frågor (FAQ) | https://docs.forestx.se/sv/cfh/cfh_faq/ | Edge cases and support answers |
| Filmer (videos) | https://docs.forestx.se/sv/cfh/cfh_filmer/ | Index of the 12 official training videos (section B) |
| Länkar | https://docs.forestx.se/sv/cfh/cfh_l%C3%A4nkar/ | Download links for the machine client |

## B. Official training videos (ForestX, YouTube embeds)

All short screen-recordings of the real product. **These are the only public footage of the actual UI** — capture frames to `evidence/screenshots/` and write per-video notes in `evidence/video-notes/<id>.md` (screen, controls, columns, statuses, colours, flow).

| # | Title (SV → EN) | YouTube | Replica relevance |
|---|---|---|---|
| 1 | Eget företag — Own company | https://www.youtube.com/watch?v=-_XopuMkqLs | Admin: company setup |
| 2 | Skapa resurser — Create resources | https://www.youtube.com/watch?v=L-LXMvoWkSk | Admin: resource master data, StanForD code, service package |
| 3 | Arbetsgrupper & Drivningskedjor — Teams & harvesting chains | https://www.youtube.com/watch?v=Kch_xvfjjuU | Admin: teams (harvester+forwarder chain) |
| 4 | Skapa användare — Create users | https://www.youtube.com/watch?v=5RFFsxxHCFA | Admin: users, roles |
| 5 | Veckokalender — Weekly calendar | https://www.youtube.com/watch?v=YqDQoU1urMQ | Resource weekly hours (drives calendar capacity) |
| 6 | **Uppdragslistan — Assignment list** | https://www.youtube.com/watch?v=kAa8RpLtyKM | **Planning milestone 1: the work-order list, filters, columns, status, move-to-resource** |
| 7 | Sortiment & PIN-filer — Assortments & PIN files | https://www.youtube.com/watch?v=miSoh8hchCE | Products/assortments on a work order; PIN generation |
| 8 | Hämta PIN-filer manuellt — Fetch PIN files manually | https://www.youtube.com/watch?v=KG5Exbt9G_w | Legacy machine workflow (XP) |
| 9 | Installera maskinklienten — Install machine client | https://www.youtube.com/watch?v=E-ZnDn9VGsU | On-board; later |
| 10 | Konfigurera maskinklienten — Configure machine client | https://www.youtube.com/watch?v=Iu0Ndb2jWhc | On-board; later |
| 11 | Planeringsverktyget skogsvård — Silviculture planning tool | https://www.youtube.com/watch?v=fyex5NP9BMk | Planning for forest services (non-harvest work orders) |
| 12 | Mobilapplikationen skogsvård — Silviculture mobile app | https://www.youtube.com/watch?v=Ht4B4CDvvro | Field app; later |

Also: "Trimble Forestry's WoodForce – the solution for smarter wood harvesting" (marketing overview) https://www.youtube.com/watch?v=dBnf5uMcsGQ

## C. Trimble product collateral

| Item | URL | Use |
|---|---|---|
| **CFHarvest Spec Sheet (PDF)** | https://assets.ctfassets.net/citn2sn5tdjr/5AZALWIh5MUFo6mVQMzh8W/4d9f4bfc230581190961703d1541f4a6/Trimble-CF-Harvest-SpecSheet.pdf | **Authoritative feature list per app** (Planning / On Board / Field Operation), the StanForD 2010 file model (OIN, PIN, FOI, FDI, HPR, FPR, HQC), site statuses, views (Reserve List, Resource Calendar, Map), site tabs, production follow-up, orders. Save to `evidence/specs/`. |
| CFHarvest Solution Overview A4 (PDF) | https://assets.ctfassets.net/citn2sn5tdjr/5bAECcz9yzcxtcApaJxFeA/2f99835fdca5e5c1716ee375407dd6a5/CFHarvest_SolutionOverview_A4.pdf | Capabilities, OEM integrations (Ponsse, John Deere, Komatsu, Ecolog), hazard maps/proximity alarms |
| Product page (Trimble Forestry) | https://forestry.trimble.com/solutions/cfharvest/ | Positioning, three apps, scale (≈1,000 contractors, 5,000+ users), customer quotes (Metsähallitus, Metsä Group) |
| Product page (Trimble DE) | https://www.trimble.com/de/products/forestry/cfharvest | Already linked from the game's rules dialog |
| Blog: CFHarvest in Finland | https://www.trimble.com/en/blog/trimble/article/cf-harvest-provides-up-to-date-logging-data-for-the-finnish-forestry | Context: Finnish origin (WoodForce), real-time reporting |
| Press: Sydved selects CFHarvest (2022) | https://news.trimble.com/2022-09-15-Sydved-Selects-Trimbles-CFHarvest-to-Digitalize-its-Forestry-Harvesting-Operations | Swedish rollout, SaaS |
| Press: Forestry One launch (2025) | https://s202.q4cdn.com/922416715/files/doc_news/Trimble-Launches-Forestry-One-to-Connect-and-Streamline-Forestry-Operations-2025.pdf | Where CFHarvest sits in the newer Trimble forestry platform |

## D. ForestX articles and customer cases

| Item | URL | Use |
|---|---|---|
| CF Harvest product page (ForestX) | https://forestx.se/en/cf-harvest-en/ | Web + onboard + mobile; scheduling/execution/monitoring/reporting cycle |
| CF Harvest article archive | https://forestx.se/en/category/cf-harvest-en/ | All ForestX CFH posts |
| Support article (2023) | https://forestx.se/en/forestx-support-fast-answers-in-swedish-for-cfharvest-users/ | Markets FI/DK/SE; VIOL3 adaptation (Biometria) |
| HedeDanmark case, part 1 (2019/20) | https://forestx.se/en/how-we-helped-denmarks-leading-forest-company-digitalise-their-workflow-part-1/ | ≈350 users; map position, guidance, report-back in one app |
| HedeDanmark follow-up (2021) | https://forestx.se/en/hededanmark-cfharvest-made-our-work-flow-completely-digitized/ | Office workload visibility, task status |
| HedeDanmark site visit (2021) | https://forestx.se/en/follow-up-at-hededanmark-after-cfharvest-project/ | LogStackPRO measurement tie-in |
| Sydved implementation (2022) | https://forestx.se/en/sydved-chooses-cfharvest-from-trimble-forestx-implements-the-system/ | ≈5 M m³/yr customer; pilot → acceptance test |
| Patrik Anderchen profile (2022) | https://forestx.se/en/patrik-anderchen-forestx-we-already-have-the-solutions-for-the-future/ | Implementation context |
| Connected Forest overview | https://forestx.se/en/connected-forest-en/ | CFH alongside CF Forest (LRM), CF Procurement (SilvaPro), CF Business |
| Contact / support | https://forestx.se/en/contact-support/ | Support channels |

## E. The shipped applications (artifacts you can lawfully inspect)

| Artifact | Identifier | Notes |
|---|---|---|
| CFHarvest Android app | Google Play `fi.fifthelement.woodforce.awsproduction` — https://play.google.com/store/apps/details?id=fi.fifthelement.woodforce.awsproduction | Publisher Trimble Inc.; updated 12 Oct 2026; "fifthelement" = original WoodForce developer (Fifth Element Oy, Finland); `awsproduction` suggests AWS backend. What's-new lists: site readiness check, retention-tree counts, session renewal. |
| CFHarvest iOS app | App Store id 6443878849 — https://apps.apple.com/app/cfharvest/id6443878849 | Same product; listing text and screenshots |
| WoodForce iOS (legacy) | https://apps.apple.com/app/woodforce/id1630357823 | Predecessor branding |
| CFHarvest Web (planning) | SaaS; URL per customer tenant | Only inspectable through an account you are authorised to use (see PLAN.md §2 scope) |
| Machine client (Windows) | Download via docs Länkar page | Installer for harvester/forwarder PCs |

## F. Standards the product is built on (public, build-from-able)

| Standard | Source | Why it matters |
|---|---|---|
| **StanForD 2010** | Skogforsk — https://www.skogforsk.se/english/projects/stanford/ | The actual data contract between planning and machines: `.oin` (object instruction), `.pin` (product instruction), `.foi`/`.fdi` (forwarder instruction/delivery), `.hpr`/`.fpr` (harvester/forwarder production), `.hqc`/`.fqc` (quality control). Public XML schemas. The replica's work-order → machine handoff should emit real OIN/PIN-shaped structures. |
| StanForD classic (pre-2010) | Skogforsk | Legacy `.apt`/`.prd`; context only |
| SenderXC | Skogforsk/industry | File transport convention the machine client mimics ("CFHarvest works like SenderXC") |
| VIOL3 / Biometria | https://www.biometria.se | Swedish timber measurement/settlement; company ID is a prerequisite in Viktiga steg |

## G. Secondary/aggregator

- WoodForce listing at Forest Innovation Hubs (Rosewood): https://www.forestinnovationhubs.rosewood-network.eu/en/content/woodforce
- AppAgg mirror of Play listing: https://appagg.com/android/business/cfharvest-39232794.html?hl=en
- Uptodown WoodForce APK mirror (do **not** use third-party APK mirrors as analysis input — obtain the APK from your own Play-licensed device; see PLAN.md §2)

## What we did not find

- No public CFHarvest API documentation, OpenAPI spec, or SDK.
- No public English manual; the ForestX portal is Swedish only. Trimble's own help centre, if any, is behind customer login.
- No product version numbers in public sources (the Play listing omits it).
- No public screenshots beyond the training videos and the four app-store images.

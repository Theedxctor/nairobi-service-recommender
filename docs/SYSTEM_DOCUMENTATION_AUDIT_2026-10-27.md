**System and Documentation Audit 27 October 2026**  
**Executive verdict**  
The implemented system is substantially ahead of the repository's top-level status  
   
 summary and has a working build with a passing backend test suite. The thesis draft,  
   
 however, is **not presentation-final**. The abstract, Table of Contents and List of  
   
 Figures are stale; Chapters 1–3 are only partially aligned with the final model; Chapter  
   
 4 is well structured but several diagrams describe a target architecture rather than  
   
 the implemented prototype; and Chapter 5 stops before its required testing,  
   
 repository-evidence, AI-use and results/discussion sections.  
Audit baseline:  
- Draft reviewed: `docs/proposal/164003_Dr.Deperias_documentation_draft.docx`  
   
 (current branch version committed on 22 October 2026).  
- Code reviewed at commit `df55b7b117a50398adf446638961946ff6ecaee0` on branch  
 `docs/20-chapters-4-5-draft`.  
- University guidance reviewed: `docs/Research Writing for CS 2 Projects - 2026.pdf`.  
- Fresh checks: tuned-model reproduction, full backend suite and frontend production  
   
 build on 27 October 2026.  
**Verified system state**  
The repository implements a responsive/installable Next.js client, FastAPI service,  
   
 XGBoost regression pipeline and PostgreSQL/PostGIS schema. The user flows include  
   
 client/provider registration and login, contextual recommendations, availability,  
   
 exact map locations, filters, bookings, status changes, dated scheduling,  
   
 rescheduling, notifications, reviews and provider-rating updates. An administrator can  
   
 sign in, but verification, monitoring and model-retraining functions remain placeholder  
   
 screens. Authentication stores identity and role claims in browser local storage and  
   
 does not use server-verified sessions or tokens, so it is not production-grade access  
   
 control.  
Current verification results:  
  
|  |  |  |  
| - | - | - |  
| **Check** |  **Result** |  **Meaning** |  
| Backend/API/unit/integration suite |  **195 passed**, 7 warnings |  Passes with the documented PostgreSQL/PostGIS environment on port 5433 and `RUN_DB_TESTS=1` |  
| Frontend production build |  **Passed** |  Next.js compiled, type-checked and generated 21 routes/pages |  
| Tuned-model reproduction |  **Passed** |  Test RMSE 0.1417; MAE 0.1160; shuffled 5-fold RMSE 0.1414 ± 0.0020 |  
| Browser E2E suite |  Not rerun in this audit |  The tests create persistent accounts/bookings and the existing development data were preserved |  
| Public deployment |  Not independently verified |  Configuration for Vercel, Render and Neon exists, but no actual deployed URL is stored in the repository |  
  
   
The first backend run without the documented database variables produced 172 passes,  
   
 10 database-connection failures and 13 skips. With the correct isolated project  
   
 database configuration, all 195 passed. For reproducibility, the report and README  
   
 should always show the environment variables alongside the test command.  
**Front matter**  
**Abstract not updated**  
The abstract is still written as a proposal: “will propose,” “will predict,” “will be  
   
 used,” “will integrate,” and “will aim.” It lists estimated travel time, congestion,  
   
 road quality, time of day, provider ratings, completion rates and experience as model  
   
 inputs. The deployed model actually consumes only distance, congestion multiplier,  
   
 time slot, provider-area road quality and provider completion rate. Estimated travel  
   
 time is display context; rating, experience and response time are not model inputs.  
Required correction: rewrite the abstract in past tense with background, objective,  
   
 method, actual results and conclusion. Include 3,000 synthetic records, the 80/20  
   
 split, training-only five-fold grid search, the two baselines, RMSE 0.1417, MAE  
   
 0.1160 and the synthetic-data limitation.  
**Table of Contents and List of Figures not updated**  
The Table of Contents ends with Chapter 3, References and Appendix A1. It contains no  
   
 Chapter 4 or Chapter 5 headings. The List of Figures ends at Figure 3.3.5 and omits all  
   
 Chapter 4 diagrams and Figure 5.3.4. The Word XML contains no automatic TOC field, so  
   
 the contents appear to be manually maintained and cannot be safely refreshed by a  
   
 field update.  
Required correction: apply real Word heading styles, insert an automatic Table of  
   
 Contents and automatic List of Figures, update all fields after final pagination, and  
   
 check the page numbers in the exported PDF.  
**Other front-matter issues**  
- The cover and declaration still call the work a “project proposal.”  
- The acknowledgement says “development of this project proposal.”  
- The cover date remains June 2026.  
- The abstract and early chapters use proposal/future tense despite completed work.  
- The current PDF beside the draft is the older 38-page September version and is not  
   
 a reliable export of the October Word draft.  
**Chapter alignment**  
  
|  |  |  |  
| - | - | - |  
| **Section** |  **Status** |  **Main finding** |  
| Chapter 1 |  Partial |  Problem, objective and general scope align, but service scope and model-feature claims do not match the final system |  
| Chapter 2 |  Partial |  Gap and conceptual motivation align; the conceptual pipeline overstates the model inputs and says cost is combined into ranking |  
| Chapter 3 |  Partial |  The 80/20 experiment and XGBoost/grid-search method align; preprocessing, features, PostGIS responsibility and tense are outdated |  
| Chapter 4 |  Mostly aligned in text |  Requirements and traceability are strong, but important diagrams remain conceptual/target-state and do not fully describe the implementation |  
| Chapter 5 |  Incomplete |  Sections 5.1–5.3.6 contain useful implementation/model evidence, but required Sections 5.4–5.7 are absent |  
  
   
**Chapter 1 findings**  
Aligned:  
- The problem focuses on static proximity/rating rankings and Nairobi travel context.  
- The general objective matches the implemented recommendation engine.  
- The synthetic-data, no-real-time-traffic, no-payment and no-live-tracking limits are  
   
 accurately identified.  
- The objective to compare against distance and rating baselines is satisfied.  
Corrections required:  
- Scope names only electricians, plumbers and cleaners; the dataset and live API offer  
   
 five categories: carpenter (26 providers), cleaner (43), electrician (48), plumber  
   
 (42) and technician (41).  
- Scope says the model incorporates estimated travel time, day/week patterns, rating,  
   
 average response time and experience. The final model has only five inputs. Job date  
   
 derives `day_type`, but neither date nor `day_type` is a direct model input.  
- “Real-time contextual risks” is too strong. Traffic values are stored historical/  
   
 synthetic corridor-and-slot averages, not a live traffic feed.  
- Claims that the system will reduce missed appointments or improve satisfaction are  
   
 expected impacts, not measured outcomes. They should be framed as intended benefits.  
**Chapter 2 findings**  
Aligned:  
- The literature review supports context-aware recommendation and tree-based  
   
 ensembles, and identifies the traffic/road-quality gap the prototype addresses.  
- The explainability motivation matches the rule-based explanation returned with each  
   
 score.  
Corrections required:  
- The conceptual framework lists estimated travel time, day type, rating, experience  
   
 and response time as model inputs; they are not inputs to the deployed model.  
- It says model output is combined with cost and availability into a composite ranking.  
   
 In the implementation, availability removes candidates before prediction, the model  
   
 score alone determines order, and rate/rating/verification are optional filters that  
   
 do not alter scores or order.  
- Assertions that no Kenyan platform uses the contextual factors should be presented as  
   
 findings from the reviewed sample, not a universal claim unless supported by a  
   
 systematic search.  
**Chapter 3 findings**  
Aligned:  
- Quantitative experimental framing and CRISP-DM/Agile hybrid approach fit the work.  
- The 80/20 split, baselines, XGBoost, grid search, RMSE, MAE and five-fold validation  
   
 are consistent with the notebook.  
- OOAD artefacts and the implementation technologies are broadly correct.  
Corrections required:  
- Convert completed methodology from “will be employed/will be developed” to past  
   
 tense, while retaining present tense only for current system behaviour.  
- Data preprocessing incorrectly names `day_type` and `service_type` as encoded model  
   
 fields and says numerical features are scaled. Only time slot and provider-area road  
   
 quality are one-hot encoded; numeric inputs are passed through unchanged.  
- Feature engineering incorrectly describes estimated travel time as the key model  
   
 feature. It is calculated for display; the model uses distance and congestion  
   
 separately.  
- The wider candidate feature list should be separated from the five features finally  
   
 selected.  
- Haversine distance is calculated in Python, not by a PostGIS spatial query.  
- “Secure cloud hosting” is not supported while the API trusts claimed IDs and the  
   
 browser holds role data without server-verified sessions.  
**Chapters 4–5 alignment**  
**Chapter 4 strong structure, diagram corrections needed**  
Chapter 4 closely follows the university guidance: requirements have identifiers,  
   
 priorities, sources and verification methods; data and interface requirements are  
   
 separate; each diagram has narrative, caption and interpretation; and a traceability  
   
 table links objectives to requirements/design/tests. FR-17 and NFR-03 honestly record  
   
 the unimplemented administrator functions and prototype-only authorisation.  
Remaining issues:  
- The use-case diagram duplicates “Confirm Booking” and “Accept or Decline Booking”  
   
 and uses `include` arrows as a workflow grouping rather than UML inclusion. The text  
   
 admits this, but the figure should be corrected before defence.  
- The architecture figure shows a native mobile application, external weather/events/  
   
 demographic sources, e-mail/SMS/push, a caching layer, API gateway, rate limiting,  
   
 monitoring, model registry, backups and production security controls that are not  
   
 implemented. A note does not fully cure a diagram that visually presents these as  
   
 system components.  
- The sequence diagram is visually low-contrast and depicts per-request database  
   
 lookups even though reference data are loaded into memory at startup. It also omits  
   
 availability filtering and current-rating lookup.  
- The conceptual ERD and logical-schema image cover only the original reference/  
   
 training tables. The implemented schema has 12 tables, including users, bookings,  
   
 notifications, reviews and reschedules, plus exact-location and booking-date fields.  
   
 Table 4.3 describes these but the principal schema diagram does not.  
- The class diagram adequately explains the ML pipeline but does not model the major  
   
 transactional booking domain. Label it explicitly as the “Recommendation Pipeline  
   
 Class Diagram” or expand the model.  
**Chapter 5 accurate core model section, incomplete chapter**  
Sections 5.2 and 5.3 contain a useful implementation environment, reproducibility  
   
 steps, dataset profile, leakage control, partitioning, model comparison, feature  
   
 importance, recommendation example and honest deviations. The headline test metrics  
   
 reproduce exactly in the current pinned environment.  
Corrections and missing sections:  
- Chapter 5 announces Sections 5.4, 5.5, 5.6 and 5.7 but ends after Section 5.3.6.  
- Add 5.4 Test Strategy and Acceptance Criteria, test-case/result tables, failure cases,  
   
 performance/latency evidence and any actual user/usability evaluation.  
- Add 5.5 Version Control and Implementation Evidence with the repository link,  
   
 branching/PR approach, relevant commits and reproducibility artefacts.  
- Add 5.6 the required factual AI-assisted-tool declaration and verification process.  
- Add 5.7 results organised by each research objective, with discussion, model error  
   
 analysis, requirement coverage and limitations.  
- The text says all 195 backend tests passed at the older referenced commit. They also  
   
 passed in this audit at current commit `df55b7b`, which should become the traceable  
   
 evidence baseline if the report is updated.  
- NFR-05 has no fixed latency target or benchmark, NFR-06 has no completed user  
   
 evaluation, and there is no recorded accessibility/security/performance evaluation.  
- The existing `ml-service/results/model_verification.md` and README contain older  
   
 fourth-decimal/CV values. Use the dated model-performance report and one named CV  
   
 protocol consistently.  
**Repository-documentation inconsistencies**  
- The top-level README still marks provider availability, PostgreSQL/PostGIS,  
   
 Next.js and final documentation as unfinished even though all are present.  
- README reports full-data CV as 0.1411 ± 0.0043, while the current reproducible  
   
 shuffled run is 0.1414 ± 0.0020. Both are defensible only when their different fold  
   
 construction is explicitly named.  
- `ml-service/results/model_verification.md` says test RMSE 0.1419 and MAE 0.1162;  
   
 the current pinned run is 0.1417 and 0.1160.  
- `docs/DEPLOYMENT.md` cites 201 providers and 6,000 historical bookings for one  
   
 hosted database, while the source CSVs and report contain 200 providers and 3,000  
   
 bookings. Hosted test/generated records must not be confused with the training  
   
 dataset.  
- The registration and landing pages say “live traffic” or “real traffic.” The system  
   
 uses stored time-slot/corridor patterns, not a live traffic API.  
- There is no final licence/access statement or release tag visible in the repository.  
**Presentation readiness for 28 October 2026**  
**Safe claims**  
- A working responsive web prototype integrates Next.js, FastAPI, PostgreSQL/PostGIS  
   
 and a packaged XGBoost pipeline.  
- The final model uses five inputs and was evaluated on a 600-record held-out subset of  
   
 a 3,000-record synthetic dataset.  
- It achieved test RMSE 0.1417, MAE 0.1160 and R² 0.4717 and outperformed both linear  
   
 baselines on that dataset.  
- Five-fold training validation RMSE was 0.1405, close to held-out test RMSE.  
- All 195 backend tests passed with the documented database environment, and the  
   
 frontend production build passed.  
**Claims to avoid**  
- “The model is 85.8% accurate.” RMSE is not accuracy, and `1 - RMSE` is not an  
   
 accuracy calculation.  
- “The system uses live traffic.” It uses stored corridor/time-slot patterns.  
- “The model predicts actual arrival time.” It predicts a synthetic reliability score;  
   
 ETA is a separate deterministic display calculation.  
- “The system is secure/production-ready.” Server-verified authentication and  
   
 authorisation are not implemented.  
- “The findings prove what causes reliability in Nairobi.” Feature importance reflects  
   
 the synthetic generator and is not causal real-world evidence.  
- “User satisfaction or missed appointments improved.” No field or user study measured  
   
 these outcomes.  
**Priority order before the presentation**  
1. Replace the abstract with a completed-study abstract and correct the cover from  
   
 “proposal” to project report/documentation.  
2. Update Chapter 1 and Chapter 3 feature lists to the final five model inputs, correct  
   
 the service scope to five categories, remove scaling/PostGIS-distance claims and  
   
 change future tense to past tense.  
3. Regenerate the Table of Contents and List of Figures after applying heading/caption  
   
 styles.  
4. Add a compact Section 5.4 test-results table and a Section 5.7 objective-by-objective  
   
 evaluation, using the fresh evidence in this audit.  
5. Replace or clearly relabel the architecture/schema/use-case diagrams so a panel is  
   
 not shown unimplemented components as though they exist.  
6. Correct “live traffic” in the user interface and bring the README/model-verification  
   
 numbers in line with the named evaluation protocol.  
7. Rehearse the limitations: synthetic data, random booking-level split, known-provider  
   
 evaluation, no live traffic, no production authentication, and no completed user  
   
 study.  
**Overall conclusion**  
The codebase supports a credible demonstration and the core model result is  
   
 reproducible. Chapters 1–3, the abstract and contents pages are **not yet confirmed as**  
   
 **updated**, and Chapters 4–5 are **not fully aligned/final**. Chapter 4's written  
   
 requirements are the strongest part of the documentation; Chapter 5's model section  
   
 is credible but the chapter is incomplete under the university's own guidance. The  
   
 next editing pass should prioritize consistency and evidence rather than adding new  
   
 features.  

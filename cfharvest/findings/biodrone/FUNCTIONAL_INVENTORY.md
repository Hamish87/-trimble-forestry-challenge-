# Biodrone Portal — Functional Inventory (from recovered React source map)

Source analysed: the 380-file `src/` tree recovered from the publicly served source map of app.biodroneportal.com (React 18 + Vite, React Router 7, TanStack Query, OpenLayers 10, react-bootstrap, styled-components). All file paths below are relative to `src/`. Everything in the files was treated as untrusted data; nothing was executed. Code is described in prose; only identifiers, route/API path strings, enum values and UI labels are quoted.

Recovered-source gaps worth knowing: two lazily-loaded chunks referenced by `routes/userRoutes/projects/singleProject/components/layers/droneImages/DroneImagesLayer.jsx` (`./DroneImagesSettings`, `./ImageViewerModal`) are **not** present in the tree, nor are the commented-out `TreeCrownToggle` / `TreeCrownGeoJSONLayer` / `chatbot` components. Behaviour of those pieces is inferred from how they are called.

---

## 1. Route map

Defined in `App.jsx` as a nested `routesConfig`; `index.jsx` mounts `<App/>` under `BrowserRouter` with providers in this order: `TokenProvider` → `ThemeProvider` → `QueryClientProvider` → `UserProvider` → `ToastProvider` → `ConfirmProvider`. If `VITE_APP_MAINTENANCE_MODE === 'true'` the whole app renders `routes/unprotectedRoutes/MaintenanceMode.jsx` instead (logo, "We'll be back soon", env-configurable message, mailto post@biodrone.no).

Every route is a child of `components/layout/Root.jsx` (`path: '/'`), which renders `Navigation`, `MaintenanceAlert`, the `<Outlet/>` and (only when logged out) `Footer`.

### Public (no guard)

| Path | Component |
|---|---|
| `/` (index) | `routes/unprotectedRoutes/home/Home.jsx` |
| `/login` | `routes/unprotectedRoutes/Login.jsx` (redirects to `/projects` if already logged in) |
| `/privacy-policy` | `routes/unprotectedRoutes/PrivacyPolicy.jsx` |
| `/eula` | `routes/unprotectedRoutes/BiodroneEULA.jsx` |
| `/contact` | `routes/unprotectedRoutes/Contact.jsx` |
| `/register` | `routes/unprotectedRoutes/RegisterAccount.jsx` (tier `pro`) |
| `/register-trial` | `routes/unprotectedRoutes/RegisterTrialAccount.jsx` (tier `trial`) |
| `/verify` | `routes/unprotectedRoutes/Verify.jsx` (query `email`, `token`) |
| `/request-password-reset` | `routes/unprotectedRoutes/RequestPasswordReset.jsx` |
| `/password-reset` | `routes/unprotectedRoutes/resetPassword/components/ResetPassword.jsx` (query `email`, `token`) |
| `/unauthorized` | `routes/unprotectedRoutes/Unauthorized.jsx` |
| `*` | `routes/unprotectedRoutes/Missing404.jsx` ("404: Lost in the digital forest!") |

### User (guard: `RequireAuth allowedRoles=[admin, user]`)

| Path | Component / provider |
|---|---|
| `/projects` | `routes/userRoutes/projects/userProjects/Projects.jsx` |
| `/projects/new` | `NewProjectProvider` → `routes/userRoutes/projects/newProject/NewProject.jsx` |
| `/projects/:project_uuid` | `ProjectProvider` → `routes/userRoutes/projects/singleProject/ProjectMapView.jsx` |
| `/projects/:project_uuid/edit` | `routes/userRoutes/projects/EditProject.jsx` |
| `/models` | `routes/userRoutes/models/modelsArchive/Models.jsx` |
| `/models/:model_uuid` | `ModelProvider` → `components/singleModel/SingleModel.jsx` |
| `/subscribe` | `routes/userRoutes/Subscribe.jsx` (static "email us to become pro" page, used by trial banner) |
| `/profile` | `routes/userRoutes/Profile.jsx` |
| `/organization/:organization_uuid/profile` | `routes/userRoutes/OrganizationProfile.jsx` (internally redirects to `/unauthorized` unless org-admin or admin) |
| `/organization/:organization_uuid/projects` | `routes/userRoutes/OrganizationProjects.jsx` (redirects unless org-admin) |
| `/checkout` | nested guard `RequireAuth allowedTiers=[pro]` → `routes/userRoutes/Checkout.jsx` |
| `/subscription` | nested guard `RequireAuth allowedTiers=[pro]` → `routes/userRoutes/Subscription.jsx` |

### Admin (guard: `RequireAuth allowedRoles=[admin]` on `/admin`)

| Path | Component |
|---|---|
| `/admin/users` | `routes/adminRoutes/users/Users.jsx` |
| `/admin/projects` | `routes/adminRoutes/projects/ProjectsView.jsx` |
| `/admin/demo-projects` | `routes/adminRoutes/projects/DemoProjects.jsx` (same table, `demo=true`) |
| `/admin/organizations` | `routes/adminRoutes/organizations/Organizations.jsx` |
| `/admin/organizations/create` | `routes/adminRoutes/organizations/Organization.jsx` (create mode) |
| `/admin/organizations/:organization_uuid` | `routes/adminRoutes/organizations/Organization.jsx` (edit mode) |
| `/admin/models` | `routes/adminRoutes/models/ModelsView.jsx` |
| `/admin/models/:model_uuid` | `ModelProvider` → `routes/adminRoutes/models/components/Model.jsx` (wraps `SingleModel` in `AdminView`) |

### Guard behaviour (`components/RequireAuth.jsx`)
- Shows a spinner while user (and, if the user has a `subscription_id`, subscription) is loading.
- A `pro`-tier user **without** an active subscription is bounced to `/` unless the current path contains `/checkout`, `/profile` or `/projects/`.
- Role/tier mismatch: logged-in → `/unauthorized`; logged-out → `/login` (with `state.from`).

### Navigation (`components/layout/navigation/Navigation.jsx`)
- Fixed top navbar, Biodrone white logo links to `/`.
- Logged out: single "Log in" button.
- Logged in: `OrganizationSwitch` dropdown, `TrialBanner` (trial tier only), a yellow "Please update your profile" alert when a non-trial user has no `name` (needed for Stripe), bell `Notifications`, and an off-canvas hamburger menu with sections: main links **Home / Projects / Models**; "Admin Menu" (admin role only): **Organizations / Users / Projects / Models** (`/admin/...`); "Organization" (org-admin, non-admin): **Organization Projects / Organization Profile**; "User": **Subscription** (pro only) / **Profile** / **Log out**; plus the `Footer` links. A pro user with inactive subscription only sees Home / Profile / Log out.
- `components/layout/navigation/AdminNavigation.jsx` — left column of `AdminView` pages ("Admin Menu"): Organization → Projects/Profile (org-admin), admin links Organizations / Users / Projects (sub-item "Demos") / Models, "Subscription" (pro+active) and "User profile".
- `components/layout/Footer.jsx`: Contact Us, Privacy Policy, EULA, Cookie Preferences (calls Cookiebot renew; warns about ad-blockers if Cookiebot is not initialised).

### TrialBanner (`components/layout/navigation/TrialBanner.jsx`)
Shown only for `tier_trial` users with no active organisation. Computes days from `trial_expiry` (unix seconds): "Your trial expires in N days" / "…expires today" / "Your trial has expired" — all link to `/subscribe`.

### MaintenanceAlert (`components/layout/MaintenanceAlert.jsx`)
For logged-in users, shows a dismissible info banner with `VITE_APP_SCHEDULING_MAINTENANCE_MESSAGE`; dismissal remembered in `sessionStorage` key `maintenanceBannerClosed`.

---

## 2. Domain model

### Constants (`utils/constants.js`)
- `IMAGE_MODE` (backend project mode): `generate_orthophoto`, `upload_orthophoto`, `single_image`.
- `PROJECT_MODE` (frontend): `orthophoto`, `single_image`. Mapping in `contexts/Project.context.jsx`: both orthophoto image modes → `orthophoto`; `single_image` → `single_image`.
- `MODEL_TYPE`: `object_detection`, `segmentation`.
- `COORDINATE_SYSTEM`: `pixel`, `EPSG:3857`.
- `MAP_LAYER_NAMES` (project.map_layers[].layer → label): `orthophoto`→"Aerial Map", `canopy_height`→"Height Model", `colored_chm`→"Height Classes", `national_dtm`→"Terrain", `contours`→"Contours", `raw_images`→"Drone Images".

### Users, roles, tiers (`contexts/User.context.jsx`)
- `ROLES`: `admin`, `user`. `TIERS`: `trial`, `pro`, `premium`.
- User object (from `GET /v2/user`): `uuid`, `id`, `email`, `name`, `userName`, `role`, `role_admin`, `role_user`, `tier`, `tier_trial`, `tier_pro`, `tier_premium`, `trial_expiry` (unix s), `trial_expired`, `subscription_id`, `active_org_id`, `active_org_name`, `active_org_access`, `is_org_admin`, `access` (premium users: array of permissions), `publish_wms`, `measurement_system` (`metric` | `imperial`).
- Derived flags: tier flags are suppressed when an organisation is active (`isEnterprise = !!active_org_id`); `activeOrgAccess` is `['all']` for org admins else the member's access array.
- Access permissions (strings): `create` (always, disabled toggle), `detect`, `train`; org admins get `all`.
- Admin user table also exposes `verified`, `verified_by_admin`, `projects[]`, `organizations[]`, `created_at`, `subscription_id`.
- Auth tokens stored as cookies `bd_access_token` / `bd_refresh_token` (`contexts/Token.context.jsx`); JWT `exp` is decoded to schedule refresh; a 5-minute interval re-checks. Password policy mirrors AWS Cognito (`utils/validation/passwordRules.js`): ≥8 chars, upper, lower, digit, special, no leading/trailing space.

### Organisation (`routes/adminRoutes/organizations/Organization.jsx`, `components/forms/OrganizationDetailsFormFields.jsx`)
Fields: `uuid`, `name`, `description`, `org_no`, `address`, `postal_code`, `city`, `country`, `project_tags[]` (restricts members to these tags), `wms_workspace_name` (null → projects not published to the map service), `members[]` each `{user_uuid, user_email, role: 'admin'|'user', access: []}`, `admin_user_email`, `projects[]`, `deleted`.

### Project (`utils/api/projects.js`, `components/projectComponents/ProjectCard.jsx`, `ProjectMapView.jsx`, `sidebars/summary/SidebarSummary.jsx`, `sidebars/LayerView.jsx`)
Fields observed: `uuid`, `title`, `description`, `tags[]`, `created_at`, `updated_at`, `file_storage` (bytes), `image_mode`, `orthophoto_project`, `wms_publish`, `demo_project`, `default_demo_model`, `center_coordinate` ([-1,-1] while processing), `extent`, `area` (m², -1 unknown), `gsd` (m/px; displayed ×100 as cm), `pixel_dimension`, `min_zoom_level`, `max_zoom_level`, `orthophoto_progress {progress, error}`, `orthophoto_is_placeholder` (quick-preview ortho while full processing runs), `deleted`, `owner {user_name, user_uuid, org_name, org_uuid, email}`, `organization {name}`, `map_layers[]` each `{layer, type: 'raster'|'vector', tiles_path, tif_path, zoom_range 'min-max', extent, files{coarse|medium|fine|extra_fine: {path, interval_meters, description}}, styling{line_width, major_line_width}, image_locations_path, grid_geojson_path, images_s3_prefix, total_images}`.
- Creation payload (`useSubmitProject.jsx`): `title`, `description`, `tags`, `file_storage`, `orthophoto_project`, `wms_publish`.
- Processing presets: `fast` or `forest` (`contexts/NewProject.context.jsx`).

### Tasks / models (`utils/api/tasks.js`, `utils/api/models.js`, `contexts/Model.context.jsx`, `toolBar/modelPicker/*`)
"Task" and "model" are used interchangeably. Fields: `uuid`/`model_uuid`, `task_uuid`, `description` (= model name), `hover_description`, `classes[]` each `{class, description, task_type, model_uuid, object_size}`, `task_type` (`object_detection`|`segmentation`, derived from first class), `image_mode` (`orthophoto`|`single_image`), `basemodel` (Biodrone-provided, cannot be edited/deleted), `multimodel` (parent grouping several single models; auto-created when >1 class is added), `is_trained`, `creator_id`, `object_size` (1 / 5 / 25 metres = Small / Medium / Large, `components/modal/createModelModal/components/ObjectSizeSelect.jsx`), `updated_at`, `training_date`, `creator_name`, `model_description`.
- Create payload (`newTask`): `classes[{label, object_size}]`, `description`, `hover_description`, `segmentation` (bool), `image_mode`.
- Annotation info (`getAnnotationInfoForModel`): `can_be_trained`, `total_number_of_annotations`, `total_number_of_tiles`, `annotations[] {project_uuid, project_name, number_of_annotations, number_of_annotated_tiles}`. Front-end rule of thumb: at least 10 annotations over 6 tiles to train.
- Trainings (`getAllTrainingsForModel` → `[ {trainings[]} ]`): each `{training_id (= model version), training_job_date, training_description, number_of_annotations, number_of_background_annotations, evaluation_result {precision, recall, f1_score, list_of_example_tile_names, list_of_example_tile_names_thumbnails}}`.
- Ongoing jobs (`getOngoingTrainingOrEvaluation`): `training_in_progress`, `evaluation_in_progress`.

### Jobs & notifications (`utils/notifications.js`, `components/notifictions/*`)
- Notification: `uuid`, `notification_type` (`job` | other → "general"), `notification_status` (`unread`/`read`), `job_status` (`pending`, `running`, `finished`, `failed`, `killed`), `project_uuid`, `project_title`, `model_uuid`, `model_info[]{class_name,…}`, `created_at`, `updated_at`, `message` (object keyed by job type → `{progress, text}`).
- Job types → labels: `segmentation_train` "Segmentation training", `segmentation_predict` "Segmentation prediction", `object_detection_train`, `object_detection_predict`, `photogrammetry` "Photogrammetry", `grid_tiling` "Grid tiling", `reproject_tif` "Reprojecting TIF", `user_annotation_processing`, `user_annotation_train`, `orthophoto_postprocessing` "Processing orthophoto", `segmentation_SAM` "Segmentation SAM", `model_evaluation`, `single_image_processing`.
- Job classification badges: "Creating Project" (photogrammetry, grid_tiling, reproject_tif, orthophoto_postprocessing, single_image_processing), "Training" (…_train, user_annotation_processing), "Detecting" (…_predict, segmentation_SAM), "Evaluating" (model_evaluation).
- Poll interval: 5 s for single-image projects, 60 s otherwise.

### Detections (`utils/map/helpers.js` `setupDetectionDetails`, `layers/detectionResults/Details.jsx`)
GeoJSON features from S3 (`detections.geojson`, projection `3857` or `normalized` pixel coords). Properties: `classid`, `classname`, `confidence` (0–1), `center {x,y}`, `bbox` (polygon coords), `area`, `bbox_area`, `last_model_used` (`bbox` → use `bbox_area`), `radius` (→ `diameter = 2r`), `height`, `estimated_stems {low, medium, high}`, `tile_name`, `annotation_uuid`, `machine_annotation`. Geometry: feature geometry = outline; derived layers `center` (point), `outline`, `bounding_box` (admins only).

### Annotations (training data)
- Orthophoto tiles (`utils/map/object.draw.js`, `polygon.draw.js`): posted per tile as array of `{uuid|'unknown', task_uuid, annotation_type: 'circle'|'bbox'|'polygon'|'rotated_bbox', machine_annotation, deprecated, human_input, classid, tile_name, x_center,y_center,radius | coordinates}`.
- Single images (`utils/map/singleImage.draw.js`): same shape plus `crs_coordinates: false`; coordinates normalised 0–1 within the image.
- Stored annotation features (GeoJSON `annotation_polygon`) carry `classname`, `tile_name`, `classid`, `annotation_uuid`.

### Grid / tiles (`utils/api/grid.js`)
`grid_geojson.features[]` with `properties.tile_name`, `image_dimensions {height_pixel, width_pixel, area_m2}`, `image_location {longitude, latitude, lrf_active, gimbal_orientation{yaw}}`, `drone_location`. Unrotated grid → image points; rotated grid → footprints.

### Hexagons (`utils/api/projects.js getHexagonFeatures`, `layers/HexagonLayer.jsx`, `utils/map/stemEnrichment.js`)
Response: `hexagon_data{ id → {metadata{hexagon_polygon[6 coords], count, area, mean_height, object_area, …}, detections{className → {count, mean_height, height_std, sum_object_area, mean_confidence, estimated_stems{low,medium,high}, …}}}}`, `metadata.total` (same shape, aggregate), `metadata.total.detections[className]{min_height,max_height,min_area,max_area}`. Default `hexagonSize` 1000 m² (`Project.context.jsx`). Enriched client-side with `stems_low/medium/high`, `stems_per_ha_*`, and per-class `stems_low:<class>` keys.

### Digital Sample Plots — DSP (`utils/api/projects.js getDSP`, `layers/singleImage/helpers.js`, `DspDetailsPanel.jsx`)
A DSP is the ground footprint of a single drone image treated as a sample plot. Response `plot_data{ key → {metadata{plot_polygon, area, count, filename}, detections{className → {count, hectare_equivalent}}}}`. `hectare_equivalent` = detections extrapolated to 10 000 m². Footprint accuracy flag `lrf_active` (laser range finder) → warning "Rough Estimate" when false.

### Filter templates (`utils/api/filterTemplates.js`)
`filter_mode`: `custom` (legacy boxes: `filter_boxes[{label, color{r,g,b,a}, multiplier, count{min,max}, height{min,max}}]`), `simple_filter` (`classification_property`, `classes[{label,color,min,max,price}]`, `custom_price_fields`), `matrix_filter` (`band_property`, `threshold_property`, `bands[]`, `classes[{label,color,price}]`, `rows[{band_value,min,thresholds[],max}]`, `custom_price_fields`). Also `title`, `hexagon_size`, `currency`, `uuid`. Sentinel 999999 = unbounded max.

### Subscriptions / Stripe (`utils/api/stripe.js`, `subscriptions.js`, `components/products/StripeProducts.jsx`)
Stripe product lookup keys: `small_storage`, `medium_storage`, `large_storage`. Product fields: `id` (price id), `unit_amount`, `currency`, `type` (`recurring`), `recurring.interval`, `features[{name}]`, `product_metadata {name, storage_limit (bytes), monthly_project_limit}`, `custom_is_disabled`, `custom_disabled_reason`, `billing_portal_url`. Subscription: `status` (`active` required), `current_period_end`, `plan{interval, amount}`, `currency`, `product_metadata.storage_limit`. Monthly limit endpoint returns `permission`, `limit`, `monthly_projects`, `image_limit`, `days_left`. Storage usage returns `used`.

### Measurement units (`utils/measurementSystem.js`)
Internal values always metric (m, m²). Display per user setting: metric m→km at 1000; m²→ha at 10 000→km² at 1 000 000; imperial ft→mi at 5280; ft²→ac at 43 560. `SQUARE_METERS_PER_HECTARE = 10000`. Norwegian "dekar" (1000 m²) used for density.

---

## 3. API surface

Base URL: `VITE_APP_BASE_API_URL` (prod fallback `https://api.biodroneportal.com/api`); v2 base `VITE_APP_BASE_API_V2_URL` or `${base}/v2`; file service `VITE_APP_FILE_SERVICE_URL`. Three clients in `utils/api/index.js`: legacy axios `api` (bearer injection, 401 → `POST /auth/refresh` with `{access_token, refresh_token}` then retry, else clear cookies and go home), `HTTPClient` (`utils/httpClient.js`, JSON fetch with retry/backoff, error-type classification incl. Cloudflare 52x, synthetic 900 network / 901 malformed), `publicApiClient` (no auth). v2 responses are `{success, message, data, errors}` and are unwrapped.

### Auth (`utils/api/auth.js`, `users.js`)
- `POST /auth/register` `{name, username(=email), email, password, password_confirm, tier}`
- `POST /auth/login` `{email, password}` → `access_token`, `refresh_token`
- `POST /auth/refresh`
- `GET /auth/logout`
- `POST /auth/request_reset_password` `{email}` (always 200 to avoid enumeration; 401 treated as rate-limit)
- `POST /auth/reset_password` `{token, email, password, password_confirm}`
- `GET /auth/verifyemail?token=&email=`
- `PUT /auth/users/set_active_org?org_id=` (empty → personal account)
- `GET /v2/user` (current user)
- `POST /users/update` `{name, measurement_system}`
- `GET /users/tags` → `{tags[], allowCreate}`
- `GET /users/storage_usage` → `{used}`

### Projects (`utils/api/projects.js`)
- `GET /projects?tags=a,b&offset=&limit=&search=` → `{projects, total, limit, offset}`
- `GET /projects/demo_projects`
- `GET /projects/{uuid}`
- `POST /projects` (create) ; `POST /projects/{uuid}/update` `{title, description, tags}` ; `DELETE /projects/{uuid}` (archive)
- `POST /projects/{uuid}/tags` [tags] ; `DELETE /projects/{uuid}/tags` body [tags]
- `GET /projects/{uuid}/progress`
- `GET /project/{uuid}/annotations` (legacy)
- `GET /projects/{projectId}/{taskId}/features/{feature_type}` — "master features": `detected_areas` (AOI/model boundary), `annotation_polygon` (training data)
- `GET /projects/{projectId}/{taskName}/{jobId}/features/{feature_type}` (per-job features)
- `DELETE /projects/{projectUuid}/{modelUuid}/delete_master_features` (delete model results on a project)
- `POST /projects/{projectId}/hexagons/{taskId}/{resolution}?class_names=` body `{filter}` → hexagon aggregate (204 = none)
- `POST /projects/{projectId}/digital_sampling_plot/{taskId}` → DSP JSON ; `?file_response=true` → **ZIP blob download** of DSP
- `GET /projects/{projectId}/footprint` → **GeoJSON** of image footprints (204 = none)
- `POST /projects/exif/image_statistics/tif` | `/png?image_mode=` body exif → `{footprint_polygon, footprint_area, overlap_score, warning}`
- `POST /projects/{uuid}/update_s3_usage` `{is_orthophoto}` (currently commented out at call-site)
- `GET projects/make_project_available_for_user/{projectId}?email=` (admin copy; note: GET)

### Processing / AI (`utils/api/biodroneai.js`)
- `POST /biodroneai/singleimage_processing/{projectUuid}` `{predict_requests[{model_uuid}], exifdata}`
- `POST /photogrammetry/process/{projectUuid}/{fileCount}` `{predict_requests, processing_preset: 'fast'|'forest'}` (ODM from JPGs)
- `POST /photogrammetry/process-orthophoto/{projectUuid}/{tifSizeMB}` `{predict_requests}` (uploaded GeoTIFF)
- `POST /biodroneai/predict-in-polygon` `{project_uuid, model_uuid, polygon, use_sam: true}` → `{results_file, warning}`

### Tasks / models (`utils/api/tasks.js`, `models.js`, `jobs.js`, `evaluation.js`, `training.js`)
- `GET /tasks/tasks_with_model/{project_uuid}`
- `POST /tasks/new_task`
- `DELETE /models/{model_uuid}` ; `DELETE /models/multimodel/{model_uuid}`
- `GET /models/available_models` ; `GET /models/available_classes?image_mode=&search=&limit=&offset=` → `{models, total, limit, offset}`
- `GET /models/get_model/{uuid}` ; `GET /models/get_annotation_info_for_model/{uuid}` ; `GET /models/get_projects_detected_on/{uuid}`
- `GET /models/get_models_from_all_users?...` (admin) → `{models, pagination{total,limit,offset}}`
- `POST /models/revert_model_to_version` `{model_uuid, target_training_id}`
- `GET /models/projects/{projectUuid}/get_detections?model_uuid=&projection=3857|normalized` → `{key}` → then file service `filelink?key=` → signed S3 URL → GeoJSON
- `GET /jobs/models_detected_on/{project_uuid}` ; `GET /jobs/check_on_going_training_or_evaluation_for_model?model_uuid=`
- `GET /evaluation/get_evaluation_predictions?model_uuid=` ; `get_evaluation_results_from_db` ; `get_training_stats_for_training` ; `replace_model_from_training?model_uuid=&training_id=` ; `get_all_trainings_for_model?model_uuid=` ; `set_training_description?model_uuid=&training_id=&description=`
- `POST /training/annotations/{projectId}/{taskId}/{tileName}` [annotations] (save tile)
- `GET /training/train/{projectUuid|'dummy'}/{modelId}` (start training)
- `GET /training/annotations/{projectUuid}/{modelUuid}?feature_type=annotation_polygon&single_image_mode=true`

### Grid & annotations (`utils/api/grid.js`, `annotations.js`)
- `POST /grid/get_grid` `{project_uuid, model_uuid}` → `{success, grid_geojson}`
- `GET /grid/{projectId}/unrotated_grid` ; `GET /grid/{projectId}/rotated_grid`
- `POST /grid/{projectUuid}/point_px` `{filename, classname, classid, model_uuid, polygon}` ; `DELETE /grid/{projectUuid}/annotation` `{model_uuid, annotation_uuid}`
- v2: `POST /v2/annotations/features` `{crs:'pixel', project_uuid, model_uuid, filename, polygons[{classid,classname,polygon}]}` (adds to detections.geojson on S3) ; `DELETE /v2/annotations/features` `{project_uuid, model_uuid, annotation_ids}`

### Organisations (`utils/api/organizations.js`)
- `POST /organizations/` ; `GET /organizations/?deleted=&search=&offset=&limit=` ; `GET /organizations/member/{user_uuid}` ; `GET /organizations/{uuid}` ; `PUT /organizations/{uuid}` ; `DELETE /organizations/{uuid}` ; `GET /organizations/{uuid}/projects?deleted=&search=&offset=&limit=&start_date=&end_date=`

### Admin (`utils/api/admin.js`)
- `GET /admin/users?offset&limit&search&tier&role&sort_by&sort_order&detailed`
- `GET /admin/projects?deleted&search&offset&limit&demo&start_date&end_date`
- `PUT /admin/{email}/verify_email` ; `PUT /admin/{email}/approve`
- `PUT /admin/users/{uuid}/update` `{role, tier, trial_expiry, access}` ; `DELETE /admin/users/{uuid}/delete`
- `GET /admin/resource_report/{uuid}` (key/value report)
- `GET /admin/get_project_files_urls/{uuid}?path=images/&file_name=` → map of key→signed URL (used for bulk image download, `odm_report/report.pdf` **PDF**, `log.json`)
- `GET /admin/project_json/{uuid}?path=log.json`
- `GET /admin/project_sagemaker_file_urls/{uuid}`
- `POST /admin/demo_project` `{project_uuid, demo_model_uuid}` ; `POST /admin/unset_demo_project/{uuid}`
- `POST /admin/project/{uuid}/update` `{uuid, title, wms_publish, owner_email, org_uuid}`

### Stripe / subscriptions / notifications / filters / MapTiler
- `POST /stripe/products` `{lookup_keys, user_id}` ; `POST /stripe/initiate` `{origin, price_id, mode, return_path}` → `{checkout_url}` ; `POST /stripe/billing_portal` `{origin, return_path, subscription_lookup_keys, show_default_subscriptions}` → `{portal_url, available_subscriptions[]}`
- `GET /subscriptions/{id}` ; `GET /subscriptions/monthly_projects_limit` ; `GET /subscriptions/monthly_user_jobs_info` → `{monthly_projects{info[], limit}}`
- `GET /notifications/user` ; `/user/unread` ; `/{uuid}` ; `/project/{project_uuid}` ; `POST /notifications/update_notifications_status?new_status=read` [uuids] ; `DELETE /notifications/delete_notifications` [uuids] ; `PUT /notifications/{uuid}/status` ; `POST /notifications/generic` ; `PUT /notifications/{uuid}/message`
- `GET /filter_templates?search&limit` → `{filter_templates, total}` ; `POST /filter_templates` ; `PUT /filter_templates/{uuid}/update` ; `DELETE /filter_templates/{uuid}`
- `GET /v2/maptiler/{projectUuid}/key` → `{api_key}` (per-project MapTiler key)
- `GET /upload/check_directory?directory=`

### File service (`utils/api/files.js`) — separate host
- `POST {FILE}/startMultipartUpload` `{fileName, projectId, size}` → `{key, uploadId}`; `POST {FILE}/getUploadPartLink/` `{partNumber, uploadId, key, forceRefresh}` → `{url}` (pre-signed S3 PUT, 50 MB parts, 5 concurrent files); `POST {FILE}/endMultipartUpload/` `{parts[{PartNumber, ETag}], uploadId, key}` → `{completed:'ok'}`.
- `GET {FILE}/filelink?key=<s3 key>` → `{url}` signed URL (204 = missing). Used for thumbnails (`{uuid}/odm_orthophoto/thumbnail.png`), CHM colormap (`{uuid}/odm_orthophoto/chm_colormap.json`), single images (`{uuid}/images/thumbnails|compressed|/{name}`), contours & drone-image GeoJSON, evaluation sample tiles, orthophoto GeoTIFF download (`tif_path`).
- XYZ tiles: `{FILE}/filelink?key={tilesPath}/{z}/{x}/{-y}.png` (each tile request answered with a signed URL; `utils/map/layer/photo.js` custom tile loader with retries; `&v=` cache-bust when placeholder ortho flips to final).

### Exports / downloads (client-side)
- Hexagon colour filter: **KML** and **GeoJSON** of classified hexagons (`layers/HexagonColorFilterLayer.jsx`, OpenLayers formats, with `name`/`description` set for KML).
- Detections: **GeoJSON** download of current model detections (`layers/detectionResults/DetectionResults.jsx`).
- Footprints: **GeoJSON** via `/projects/{id}/footprint`; DSP: **ZIP** via `digital_sampling_plot?file_response=true` (`layers/singleImage/SingleImageFootprintsLayers.jsx`).
- Orthophoto / height layers: **GeoTIFF** via signed `tif_path` ("Download Photo", `layers/PhotoLayer.jsx`).
- Custom-filter **PDF** (`modifyLayers/hexagonColorFilter/PDFExportButton.jsx` + `PDFModal.jsx`, @react-pdf/renderer: map canvas snapshot page + summary page with per-filter area & "Calculation", hexagon size).
- Matrix/Simple filter **report**: `ExportReportModal.jsx` → printable HTML/PDF in new tab (dark/light) or **DOCX** (`matrixFilter/utils.js`, `dspColorFilter/dspExportUtils.js`, docx + file-saver) with map image incl. scale bar (`utils/map/scaleBar.js`), project info (area ha, data collection date, hexagon size or total plots/footprint area, resolution cm/px, objects detected, mean height, AI detector, detection classes), notes, detection statistics table, classification summary with price/m² and totals, coverage-gap warning.
- Admin: bulk download of project images from S3, ODM report PDF, ODM log JSON, Sagemaker artefact links (`utils/downloads.js`, admin modals).
- No WMS/WFS/WMTS is consumed by the frontend; WMS appears only as publish flags (`publish_wms`, `wms_publish`, `wms_workspace_name`) and an inert "Publiser til wms" button in the admin edit modal.

---

## 4. Screens and workflows

### 4a. Public pages
- **Home** (`home/Home.jsx`): hero "Welcome to Biodrone — Your Portal to AI Powered Object Detection Tools", lead "Identify objects, track alterations, and uncover patterns", "A cloud-based software solution for analysing drone images of nature habitats with the help of artificial intelligence." Logged-out: "Get Access" (→ `/register`) and "Log in". Logged-in pro without active subscription: message that a subscription is required, `StripeProducts` buttons, `ProductsFooter`, then a black band "Curious about what's possible?" listing demo projects (`home/components/DemoProjects.jsx` → project cards). Otherwise a "Your Projects" button.
- **Login**: email + password (react-hook-form), error alert from API `detail`, links to register and password reset.
- **Register** (`RegisterAccount.jsx`): split view; left "Get access in 3 easy steps" (create account, verify email, choose subscription); right card "Create Your Account" with `RegisterForm` (Name, Email, Password with live `PasswordRequirements` chips "8+ chars / Uppercase / Lowercase / Number / Special char", Confirm Password, required checkboxes agreeing to EULA and Privacy Policy; tier `pro`); success alert "We've sent you a verification email". Bottom: "Available Subscription Plans" presented as cards.
- **Register trial** (`RegisterTrialAccount.jsx`): same form, tier `trial`, button "Register for a trial", success note that an administrator must approve the trial account.
- **Verify**: reads `email`/`token`; shows "Verify email" button; success redirects to `/login` after 5 s; errors for missing params / invalid token.
- **Request password reset**: email form; success "Check your email…"; copy deliberately never says the address is wrong.
- **Password reset**: disabled email, New Password, Confirm New Password; client validation (`resetPassword/utils/helpers.js`); success redirects to login after 5 s.
- **Contact**: mailto post@biodrone.no. **EULA**: 11 numbered sections (parties, account/organisation management, subscription & licensing, cancellation—no refunds, payment & data ownership—user retains data, Biodrone may use non-personal annotations/models for improvement and marketing indefinitely, IP, liability, user content, privacy, amendments, jurisdiction). **Privacy policy**: Cookiebot declaration embed, registration forms, AWS Cognito authentication, Stripe identity verification, Intercom Messenger, Google Tag Manager.
- **Unauthorized / 404 / MaintenanceMode** as described above.

### 4b. Projects list (`routes/userRoutes/projects/userProjects/Projects.jsx`)
- Title "Your Biodrone projects[ in <org>]". Filters (hidden for brand-new users): `SearchFilter` ("Search project name", 500 ms debounce, URL param `search`) and `TagsFilter` (multi-select "Filter by tags" from `/users/tags` plus default "Demo"; URL param `tags`). View toggle **Grid / Map** persisted in `localStorage.selectedView`. Counter "Showing X of Y". Infinite query: 12 per page in grid, 100 in map. Bottom `Toolbar` with "New Project" (disabled for expired trial; tooltip "You can create one project during the trial period"). New users see "Start by creating your first project. You need images from a drone or an orthophoto."
- **Grid** (`views/ProjectsGridView.jsx`): 4-column cards, "Load more". **Card** (`components/projectComponents/ProjectCard.jsx`): tag badges overlay, thumbnail (`{uuid}/odm_orthophoto/thumbnail.png`, logo fallback), `ProjectProgress` overlay (polls `/notifications/project/{uuid}`; shows classification badge, label text, progress bar or "Pending startup"), title ("Untitled project"), date (nb-NO), description, storage "X MB storage" (pro, non-demo), red "Project processing has failed" when `orthophoto_progress.error`; "View Project" disabled while `center_coordinate` is unset; ⋮ menu Edit / Edit tags / Delete (delete disabled for trial; hidden for demo projects). Delete → `ArchiveProjectDialog` requiring typed "DELETE". Tags modal → add/remove via tag endpoints.
- **Map** (`views/projectsMapView/*`): left scrollable list of project items (thumbnail, title, date, "View Project", pin button zooms to the project) + right OpenLayers map (OSM base, clustered pins with count circles, hover overlay card, click on cluster zooms). Projects without valid `center_coordinate` are excluded.
- **Edit project** (`EditProject.jsx`): Project Name (required), Project Description, Project Tags (creatable multi-select), "Delete project" (not trial), Back/Save.
- Demo projects: `demo_project` flag; card background accent; in the map view a banner states features are disabled.

### 4c. New project wizard (`newProject/NewProject.jsx`, `contexts/NewProject.context.jsx`)
Three `Step` sections ("Step N: header", inactive steps dimmed and hidden until prerequisites met):
1. **Choose Project Type** (`SelectProjectType.jsx`): two large buttons — **Orthophoto** "Use an existing orthophoto or stitch together JPGs to make a new one" and **Single Images** "Positions individual images as markers on the map".
2. **Add <Type> Project Details** (active once a type is chosen): Project Name * (required), Project Description, Project Tags (creatable unless org restricts tags).
3. **Upload Project Files** (active once a name exists): left `UploadField` dropzone ("Project files (.jpg, .tif, .laz)" for orthophoto; "(.jpg, .laz)" for single images; Upload dropdown "Files" / "Folder" using webkitdirectory; animated border while dragging; file list with size and remove buttons; "Remove All" with confirm). Right column: `FileStorage` alert (pro only: "File Storage" / "File Storage Limit Reached" with `StorageStatus` bar used/to-be-added/total and "Need more storage?" → `ProductsModal` listing upgradable subscriptions) and a `Map` preview (OSM; after EXIF parsing it draws the computed footprint polygon(s) with smoothed corners, shows "Area:" and "Overlap Score: N %", warnings when EXIF preprocessing fails or the API returns duplicate-image warnings).
   - File rules (`UploadField.jsx`): names sanitised to `[a-z0-9._-]`; only jpg/tif/laz kept (others toasted as unsupported); one `.tif` max and no mixing jpg+tif; one `.laz` max; max files: admin unlimited, trial 100 images or 200 MB, orthophoto = subscription `image_limit`, single images 1000. Switching to Single Images clears a TIFF.
   - EXIF (`utils/exif.js`, exifr): JPG → `image_name`, `GPSLatitude/Longitude/Altitude`, `RelativeAltitude`, `PixelX/YDimension`, `FocalLength`, `FocalLengthIn35mmFilm`, `GimbalYaw/Pitch/RollDegree`, `BitsPerSample`; JPG without GPS throws "No GPS data found in image". TIFF → `BitsPerSample`, `Compression`, `ExtraSamples`, `GeoTiffAsciiParams`, `GeoTiffDirectory`, `ImageHeight/Width`, `ModelTiePoint`, `PhotometricInterpretation`, `PixelScale`, `PlanarConfiguration`, `RowsPerStrip`, `SampleFormat`, `SamplesPerPixel`. Sent to `/projects/exif/image_statistics/...` for footprint/area/overlap.
   - `AdvancedActions`: collapsible "Advanced settings" (JPG orthophoto only) with toggle **Fast Orthophoto** "Faster project creation, but without height calculations" (→ preset `fast` vs `forest`); hidden/commented controls for DSM, Ignore GSD, Tiles, Resolution, Mesh Size.
   - `FormActions`: `LimitInfo` ("You have previously created X out of Y projects this billing period…"), warning "You need at least 25 images to create an orthophoto", Cancel, **Create Project** split button with "Create project and run detection" → `CreateProjectWithModelModal` (select a model grouped "Base Models"/"Custom models" filtered by project type, with icons for object detection / segmentation / multi; child classes of multimodels listed indented; search matches model or class descriptions).
   - Monthly project limit reached → whole page replaced by `ProjectLimitWarning` ("Limit of N projects reached… deleted projects are also counted… wait N days…") plus `SubscriptionsAvailableForUser` filtered to higher `monthly_project_limit`.
   - Submit (`utils/hooks/useSubmitProject.jsx`): validates ≥25 JPGs for orthophoto / ≥1 for single; `beforeunload` guard; `POST /projects`; multipart upload to S3 via file service with `UploadProgressModal` ("Project: name — Uploading (N%)… Please do not close or refresh"); then `startPostProcessing` (single-image / photogrammetry / process-orthophoto with `predict_requests` and preset); schedules notification refetches at 10/20/40 s; navigates to `/projects`. On failure archives the half-created project and shows `ErrorModal` "Project creation failed".

### 4d. Single project map view (`singleProject/ProjectMapView.jsx`)
**Load**: fetches project; handles deleted (non-admin) → "Deleted project"; pro without subscription → error; `orthophoto_progress.error` → "Something seems to have gone wrong" with mailto; missing centre → "Project not ready" (or after 12 h "Creating a project sometimes take a while"). Demo projects (non-admin) set `isDemo` (disables toolbar actions). While `orthophoto_is_placeholder` the project is re-polled every 15 s and a banner "Quick preview — positioning is approximate. Full-resolution map will appear when processing completes. N%" shows; when it flips, orthophoto tiles are cache-busted.

**Layout**: full-height OpenLayers map (`components/Map.jsx`, WebGL renderer, EPSG:3857, zoom 17 at project centre, min zoom 6, keyboard pan, rotation disabled, custom tooltip overlay). Overlays: left "Layers" sidebar (`sidebars/LayerView.jsx`, collapsible, 360 px; child sidebars open offset to the right and dim the parent), right-top `MapLegend` ("Model Classes" → "Detections" solid lines, "Training Data" dashed), right `CHMColorBar`, bottom-right `BaseMapSelector`, `MapScaleBar`, bottom `MapToolbar` (model picker + action buttons), bottom `CarouselSlider` (single-image projects), `Dialogue` (top-right instruction box, auto-close 5 s), `ConfirmModal`, floating `BannerStack` (demo/placeholder).

**Base maps** (`layers/baseMap/constants.js`): "Satellite" (MapTiler `maps/hybrid-v4`, needs key), "Terrain" (MapTiler `maps/outdoor-v2`), "Standard" (OpenStreetMap tiles), "No Map". Key fetched per project from `/v2/maptiler/{uuid}/key`; preferred satellite once key available; falls back to Standard on key failure or tile load error (toast "MapTiler maps are unavailable"). Panel button sits above the image slider in single-image mode.

**Layers sidebar** (`LayerView.jsx`): header project title + `SidebarSummary` (Project Type, Area, GSD cm). Orthophoto projects: group **IMAGERY** (static z-order): "Surface map" (`dsm_tiles`, only if directory exists), "Aerial Map" (orthophoto, visible by default, "Download Photo" GeoTIFF), "Drone Images" (`raw_images` vector config); group **ANALYSIS** (drag-and-drop reorderable via dnd-kit, `components/sortableLayer/*`, `hooks/useLayerReorder.js` re-assigns z-indices): "Height Model" (`canopy_height`), "Height Classes" (`colored_chm`), "Terrain" (`national_dtm`), "Contours". Non-orthophoto raster layers get an **Opacity** slider. Single-image projects: "Map Layers" → `SingleImagePointsLayer` ("Images"). Group **MEASUREMENT** (collapsed): checkbox "Measurements" adds the temporary measurement layer and a dialogue "Measurement Layer Added — Use the draw tools in the bottom toolbar… will not be saved". Section **Model** (when a model is picked): model name, ⋮ "Delete Results" (deletes master features for that model on the project), then `AoiLayer` "Model boundary", `DetectionResults`, `TrainingDataLayer` (orthophoto) / "Training Data" toggle (single image), `HexagonLayer`, and for premium/enterprise/admin in single-image mode the "Digital Sample Plot" layer.

Layer components:
- **AOI / Model boundary** (`layers/AoiLayer.jsx`): yellow dashed WebGL polygon(s) from `detected_areas`; refetched every 5 min; auto-fits the view once per model load unless the user has already moved the map.
- **Detection results** (`layers/detectionResults/DetectionResults.jsx`): fetches detections GeoJSON (5-min refetch), builds colour scheme per `classid` from 10 default colours, creates WebGL layers "Center" (points, radius interpolated by zoom), "Outline" (polygons, off by default), "Bounding Box" (admin only), and a canvas **Details** layer (`Details.jsx`) that labels every detection with class, confidence %, height, area, diameter and "Est. Stems (L/M/H)"; hovering a detection shows a tooltip with the same fields; clicking copies lat/lon to clipboard. Header buttons: **Filter** (`FilterDetections.jsx` sidebar: per class a histogram + dual-handle range + Min/Max inputs for `height`, `area`, `diameter` (derived from area as circle), `confidence` (0–100 %); draft filter applied live; "Apply Filters"/"Reset Filters"; counts "filtered of total"), **Palette** (`DetectionsPalette.jsx`: per-class visibility checkbox + colour picker), **Export GeoJSON**. "No objects found" when empty.
- **Training data** (`layers/TrainingDataLayer.jsx`): WebGL polygons of `annotation_polygon` features coloured per `classname` (URL `showTrainingData=true` makes it visible), "Palette" sidebar (`modifyLayers/ModifyTrainingData.jsx`, class visibility + colour, "Unlabeled" for null class), and a **Grid** toggle (`TrainingDataGridLayer.jsx`) that draws the cyan dashed tiles that contain annotations with a hover tooltip "Annotation count: N".
- **Hexagons** (`layers/HexagonLayer.jsx`, `utils/map/layer/hexagon.js`): aggregate hexagons from `/hexagons/{task}/{size}` with the active detection filter; default colour navy, opacity fades out as zoom increases (opaque ≤ z15, invisible ≥ z22); click selects a hexagon (orange highlight) and opens **Selected Hexagon Info** (`sidebars/HexagonInfo.jsx` + `sidebarElements/HexagonAccordion.jsx`: "Objects in Total", "Area", "Mean Height of Objects", "Est. Stems (Low/Medium/High)" as "count / per-ha pr ha", then an accordion per class with count, mean height, Height STD, sum object area, mean confidence %, estimated stems). Layer functions: **Modify** (`modifyLayers/FilterHexagon.jsx` sidebar "Modify Hexagons": `HexagonSize` "Hexagon size (m²)" + Apply, hexagon colour picker, and per class two histogram range sliders "<class> height" and "<class> count" that hide non-matching hexagons) and **Color Filter**. Inline collapsible `HexagonSummaryPreview` ("Total Objects", "Total Area", "Stem Estimates" Low/Medium/High, "Breakdown by Classes" comparison table Count %, Area, Mean Height, Stems L/M/H; "More Details" opens **Hexagons total summary** sidebar).
- **Hexagon Color Filter** (`modifyLayers/hexagonColorFilter/HexagonColorFilter.jsx`, sidebar 450 px; hides the normal hexagon & AOI layers and draws a classified copy): "Filter Mode" **Custom / Matrix**; `HexagonDataFields` ("Objects" multi-select of classes, defaults all; "Hexagon size (m²)"). *Custom mode*: "Filter template" select (saved `custom` templates, deletable), "Save current filters as new template / Update filter template" (title modal), **Filter Boxes** each with Label, colour picker, range sliders "Mean Height (m)" and "Count" (bounded by data min/max), "Calculation multiplier" ("Multiplies with total area, useful for calculations like pricing"), per-box results Area m² (% of hexagons) and Calculation; "Add filter box +"; **SUMMARY** card listing each box and "No filter match"; a hexagon matching several boxes gets stacked fills; buttons **Export KML**, **Export GeoJSON**, **Generate PDF**. *Matrix mode*: `MatrixFilterMode.jsx` (see below) with **Export Report**. Closing the sidebar restores the layers.
- **Matrix / Simple classification** (`matrixFilter/*`): a **matrix classification** is a 2-D rule set: a *band property* (rows, e.g. "Mean Height (m)" bands 2,3,4,5,6 — each hexagon assigned to the nearest band value) × a *threshold property* (columns, e.g. "Density (/dekar)"); each band row has `min` (below → "Below Minimum"), ordered class boundaries (first boundary ≥ value wins) and `max` (above → "Unclassified"). Default preset "Default Classification" has 5 classes Very Easy/Easy/Medium/Hard/Very Hard with price/m² 0.5…3.0 EUR (Allskog-style harvest-difficulty matrix). A **simple (1-D)** filter classifies on one property with contiguous `[min,max]` classes (open-ended last class); preset "Volume Classification" (Very Low…Very High on `volume_m3`). Available properties (`AVAILABLE_PROPERTIES`, shown only if present in data): `mean_height`, `count`, `density` (count/area×1000 = per dekar), `mean_crown_diameter`, `total_area`, `confidence`, `hectare_equivalent` (count/area×10 000), `stems_low/medium/high`, `stems_per_ha_*`, `volume_m3`, `volume_per_ha_m3`, `basal_area_m2`, plus dynamic per-class keys "Ha/eq (<class>)", "Stems <Level> (<class>)", "Stems/ha <Level> (<class>)". UI: Filter mode toggle "Matrix (2D) / Simple (1D)", "Filter template" select (presets + saved `matrix_filter`/`simple_filter` templates; save/update/delete), "Classification Results" table (Class, Count, Area m², %, incl. Below Minimum / Unclassified), "⚙️ Edit filter" opens a bottom drawer editor: *Matrix editor* — Band (rows) / Threshold (columns) / Currency selects with data ranges and coverage %, coverage-gap warnings, band chips (+ Add band), "Classes & Pricing" (colour+opacity, label, price/m², remove, + Add class), "Threshold Matrix" grid (Min, ≤ class boundaries, Max per band), "Cost Summary" (total area, per-class area × price, custom price lines applied to total area, grand total), "Project Notes (optional)" included in reports, "📄 Export Report". *Simple editor* — Property & Currency, class cards with Min/Max sliders+inputs and price. Currencies: UNIT (none), NOK kr, EUR €, USD $, SEK kr, GBP £. Classified hexagons carry `name`/`description`/`matrixClass` for KML export. Report content described in §3.
- **Measurement tools** (`utilityButtons/measurementTools/*`): radio toolbar Move (M), Area (A, polygon with live area label), Distance (D, line with live length label), Erase (E, click a sketch to delete); labels use the user's unit system; sketches are session-only.
- **Contours** (`layers/contours/*`): GeoJSON contour lines from `files.<interval>.path`; "Settings" sidebar "Contour Settings": "Detail Level" select among available "Coarse (2m interval) / Medium (1m interval) / Fine (0.5m interval) / Extra Fine (0.25m interval)" with description, "Contour color" picker; major lines thicker and labelled "<level>m" at close zoom.
- **Drone Images** (`layers/droneImages/DroneImagesLayer.jsx`): blue capture-location points (visible ≥ z15) from `image_locations_path`; hovering shows that image's footprint polygon (yellow) from `grid_geojson_path`; click opens an image viewer modal (signed URL `images_s3_prefix + tile_name`); settings sidebar for point/footprint colours and total image count (settings/modal chunks not recovered).
- **CHM colour bar** (`components/CHMColorBar.jsx`): when "Height Classes" is visible, fetches `chm_colormap.json` and renders "Height Classes" legend rows (`height_min`–`height_max` m with colour; ground 0–1 m transparent). Polls layer visibility every 2 s.
- **Single-image mode layers** (`layers/singleImage/*`): `SingleImagePointsLayer` ("Images": a point per image at drone/image GPS, green if it has detections else yellow, orange dashed ring if it has training annotations, direction arrow from gimbal yaw at z>18; hover tooltip shows thumbnail with per-class detection counts "N" and annotation counts "A:N"; loading overlay "Loading N / M images"; "The images are not ready" if ≥10 thumbnails missing). Clicking a point (`SelectedSingleImageLayer`) hides the toolbar and points, zooms to the image footprint, overlays the compressed then full-resolution image georeferenced to its footprint, draws detection polygons (class colour, confidence % label) and dashed training annotation polygons, and shows an overlay with file name, yaw arrow/degrees and centre coordinate copy button; clicking outside returns. `SingleImageFootprintsLayer` renders either "Footprints" (rotated grid, with area m² and "Rough Estimate" warning when `lrf_active` is false; "Export GeoJSON") or, as a model result, **Digital Sample Plot** (DSP) polygons (hover: area, per-class count "/ N per ha"; click opens the image; "Color Filter"; "Export ZIP"; collapsible `DspDetailsPanel`: "Total Detections", "Total Images", "Total Footprint Area", "Unique Coverage" (union of plots via polygon-clipping, drawn as orange dashed boundary), "Hectare Equivalent /ha", "DSP mean ha eq all", per-class "DSP mean ha eq <class>", button "Detections per Plot" → table sidebar Plot / Class / Count). `SingleImageAnnotationPointLayer` attaches training annotations when "Training Data" is toggled.
- **DSP Color Filter** (`modifyLayers/dspColorFilter/*`, premium/enterprise/admin): same Matrix/Simple UI as hexagons applied to DSP plots; plots are enriched client-side (`useDspEnrichment.js`): `count` (DSP count), `area` (plot m²), `hectare_equivalent` (sum of per-class), per-class `hectare_equivalent:<class>`, and from matched normalised detections `mean_height` (mean of detection heights), `confidence` (mean), `total_area` (sum of detection areas), `mean_crown_diameter` (mean of 2×radius), `density` (matched detections / plot area × 1000 → per dekar). Styling is applied through a WebGL expression on `classId`. Export via DSP-specific PDF/DOCX ("Total Plots", "Total Footprint Area").
- **Single-image carousel** (`singleImageSlider/*`): bottom collapsible strip of thumbnails (20/10/5 per page by width), per-thumbnail class-colour dots with counts, index slider for >10 images, tools **Sort Images** ("Detections ascending/descending") and **Filter Images** (checkbox per class plus "no detections"); clicking a thumbnail selects the image on the map; hovering a detection on the map highlights its image.

**Toolbar** (`toolBar/MapToolbar.jsx`): "Model:" dropdown (`ModelPicker.jsx`/`Models.jsx`/`ModelList.jsx`): tabs "Orthophoto Models" / "Single Image Models" (other type disabled with "Only available for … projects"), sections "Base Models" ("pre-generated by Biodrone and cannot be modified or removed") and "Customizable Models" ("can be trained to detect any object of interest"), multimodels expand to child models, green "Analyzed" tag for models already run on this project, delete icon (confirm; trial users cannot), sticky search box, and top item **Create Custom AI Model** (trial: one custom model). Selecting writes `?model=` to the URL; demo projects auto-pick `default_demo_model`. Buttons: `MeasurementTools` (when measurement layer added), **Detect Objects** (`DetectInArea.jsx`, enabled when the picked model `is_trained`), **Train AI** / **Improve AI Accuracy** (`Annotate.jsx`, shown when a model is picked and not a base model unless admin), **Add/Remove Detections** (`EditDetections.jsx`, single-image mode while an image is selected and detections exist).

**Model management modal** (`components/modal/createModelModal/CreateModelModal.jsx`): "Creating a Custom Model — For Orthophoto/Single Image Projects"; **Model type** toggle "Object Detection — identify objects, e.g. detecting and counting trees" / "Segmentation — identify areas, e.g. areas of windfall"; Model Name (required), Model Description (≤60 chars); "Objects/Areas to identify" rows: Label (sanitised to letters/digits/_-, Title_Case) with warning when the label already exists in another model, Object size toggle Small ~1 m / Medium ~5 m / Large ~25 m, "Add row"; note "Adding multiple labels automatically makes this a multimodel."

**Stem estimates** (`utils/stemEstimates.js`, `utils/map/stemEnrichment.js`): the backend supplies `estimated_stems {low, medium, high}` per detection and per class per hexagon (a low/medium/high scenario of stem count — e.g. stems hidden under a detected crown). The client sums per-class values into hexagon totals `stems_low/medium/high`, and computes densities as stems ÷ (area m² ÷ 10 000), rounded, displayed "42,344 / 7,561 pr ha". Classes with null stems are skipped; all-null hexagons stay unclassified for stem properties. No volume/basal-area formulas exist client-side; `volume_m3`, `volume_per_ha_m3`, `basal_area_m2` are read if the backend provides them.

### 4e. AI: models archive, single model, annotation & detection
- **Models archive** (`routes/userRoutes/models/modelsArchive/Models.jsx`, "Your Custom Models"): tabs Orthophoto Models / Single Image Models (`?tab=`), search "Search for model", "Create New Model" button, table columns Name (type icon, link, description), Last updated, "Ready to use" (boolean, tooltip "Whether the model is trained enough and ready to use"); "Load more models".
- **Single model** (`components/singleModel/SingleModel.jsx`): breadcrumbs Models → name; details Description, "Approx. size ~ N m", "For project type"; alert "Training and evaluating model" while jobs run (polled every 10 s); `Train` alert — "Not ready for AI training… At least 10 annotations over 6 tiles" or "AI training available — Start AI training"; when trained: **Evaluations** chart (lines Precision, Recall, F1 Score per "Model v. N" + bars Number of annotations; needs ≥2 evaluated versions), **Model Version Details** (version select, "Rollback model to this version" with confirm "This will delete all annotations made past this version", editable "Version description", "Training details": Annotations, Background Images, Training Date; "Model Performance": Precision/Recall/F1 with explanatory popovers, or "not yet supported for segmentation models"; "Sample training images" lightbox from evaluation sample tiles), **Projects with training data** (links `/projects/{p}?model=…&showTrainingData=true` with "N annotations on M tiles"), **Projects detected on** (date, "Used in multimodel"); "Delete Model" (confirm).
- **Detection job flow** (`utilityButtons/DetectInArea.jsx`): permission checks (trial expired, pro without subscription, premium without `detect`, org access `detect`/`all`); dialogue "Set a boundary — Please draw a boundary around the region where you wish to generate detections. Press ESC to cancel."; polygon draw; confirm "Detecting objects is a resource-intensive process that may take several minutes…"; `POST /biodroneai/predict-in-polygon` (`use_sam: true`); toast "Running detection… You will be notified when detection is complete." (or warning); notifications polled; when the job finishes all queries containing the model uuid are invalidated so new detections appear (`Notifications.jsx`).
- **Training flow — orthophoto** (`utilityButtons/Annotate.jsx`, `ai/AnnotateOrthophoto.jsx`): permission checks (trial: one training, no multimodel, not already trained); fetch grid; dialogue "Set a boundary"; draw polygon → tiles whose centre is inside become the annotation queue (errors "The selected area is too small" / "No photo to annotate in the selected area"); map hides AOI/DSM/hexagon/training layers; yellow dashed active tile with shadow; sidebar "Items to annotate" (radio per class, shortcut keys 1..n); toolbar: Exit (ESC, "Save & Exit"/"Exit"), draw tools Box/Circle (object detection) or Polygon/Freehand (segmentation) with shortcuts D draw, E erase, R rotate, counter "Annotating i / n", **Start AI training** (checks ≥10 annotations & 6 tiles, confirm), Skip (space; confirms discarding), Continue (Enter; saves tile via `POST /training/annotations/...`; empty tile confirm "No new annotations were made… Still good to go?"). Existing detections are loaded as editable annotations (modify/translate/scale/rotate; features outside the active tile are locked); eraser cursor deletes. Last tile → training starts (`GET /training/train/...`), toast, exit.
- **Training flow — single images** (`ai/AnnotateSingleImages.jsx`): same queue over images; a separate pixel-projection map shows compressed then full-res image; draw Circle/Box (object detection, polygons saved as `bbox`) or Polygon/Freehand; Ctrl+C/Ctrl+V copy-paste annotations; Next Image / Skip / Start AI training.
- **Add/Remove Detections (DSP mode)** (`EditDetections.jsx` → `AnnotateSingleImages isDSPMode`): opens the selected image with its current detections as editable boxes; "Save and apply" diffs added/removed/modified features and calls `DELETE /v2/annotations/features` and `POST /v2/annotations/features` (pixel CRS, normalised polygons) so detections and DSP statistics are recalculated and also stored as training data.

### 4f. Notifications, organisation switch, profile, organisation pages, subscription
- **Notifications** (`components/notifictions/Notifications.jsx`): bell with unread count badge and ring animation; dropdown lists notifications (job: badge classification, date, link to project `?model=` or to model page for `model_evaluation`/`user_annotation_train`, text with loading dots, circular % progress; "Pending startup"; "Error: <job> failed"); "Clear inactive items"; per-item delete (not while running); closing marks all as read. Running jobs re-poll individually (60 s / 5 s single image).
- **Organization switch** (`components/organization/organizationSwitch.jsx`): "Logged in as <org or email>" dropdown listing organisations and "Personal User"; calls `set_active_org`; disabled inside a project.
- **Profile** (`routes/userRoutes/Profile.jsx`, AdminView layout): Name (required; warning "Missing name"), Email (disabled), Measurement System toggle Metric/Imperial, "Update User", "Request password reset" link.
- **Organization profile** (`OrganizationProfile.jsx`): org detail fields, read-only admins list, Members list with access switches Create (locked) / Detect / Train, note to email Biodrone to add/remove members, Project tags (creatable, restricts members), Save.
- **Organization projects** (`OrganizationProjects.jsx`): admin-style filters (search "Title, uuid, userid, email or org-uuid", Date range picker with "Pick last month/this month", Archived toggle), table Title (thumbnail+link) / Uuid / Owner / Created / Area, footer total area and count, Load more.
- **Subscription** (`Subscription.jsx`): "You have no active subscription!" + products, or "Usage status for your active monthly subscription": `IncludedSubscriptionItems` — "File storage status" bar and "Projects — Used N out of M" with the list of projects/jobs this period (deleted ones marked); price per interval, "Current billing period ends at"; `BillingPortal` link "Manage your current subscription in the Stripe billing portal"; "Change your subscription" buttons from `available_subscriptions`.
- **Checkout** (`Checkout.jsx`): reads `price_id`, `mode`, `return_path`, `reference_id`, `success`, `canceled`; initiates Stripe Checkout and redirects to `checkout_url`; on return polls subscription until `active` ("Subscription created. You will be redirected shortly") or shows error with reference code; "Order canceled!" path.
- **Plans**: three storage tiers (small/medium/large) shown with name, features, price (en-IN currency formatting), "Billed monthly/yearly"; limits are `storage_limit` bytes and `monthly_project_limit`; trial accounts: 1 project, 100 images or 200 MB, one custom model, one training, cannot delete projects/models or edit detections.

### 4g. Admin
- **Users** (`routes/adminRoutes/users/*`): filters search (email/uuid), tier, role, sort by Created/Email, order; table Email, Email Verified (+ "Verify" button → `verify_email`), Approved (+ "Approve" → `approve`), Projects count, Uuid, Tier, Access (premium: list), Role, Subscription ("See in Stripe" dashboard link, test vs live by env), Organizations, Created; row menu: Monthly billing (→ admin projects filtered by user id, archived, last-month date range, `mode=billing`), All projects, Edit (modal: role, tier, premium access switches Create/Detect/Train, trial expiry date), Delete (typed DELETE).
- **Projects / Demo projects** (`routes/adminRoutes/projects/*`): filters search, date range, Archived; table Title (thumbnail, link to map), Uuid, Owner (user, org, ids copyable), Created, Area; footer "Total area for selected filters"; row menu: Resource report (key/value modal), View on map, Details (project JSON), Edit project (Norwegian-labelled modal: change title / owner email / organisation uuid, "Kopier til bruker" → Copy modal emailing a target user, inert "Publiser til wms"), Images from s3 (bulk download), ODM report (PDF) and ODM log (orthophoto projects), Sagemaker files (list of signed links; "Ingen filer funnet"), Set as demo project / Update demo model (requires model uuid trained on the project) / Unset, ODM Postprocess (generate_orthophoto projects: "Image count" + "Fast Orthophoto" → re-run photogrammetry), Archive.
- **Organizations** (`routes/adminRoutes/organizations/*`): search, Archived toggle, table Name, Uuid, Admin, Members, Projects; row menu Monthly billing / All projects / Edit / Archive; "New organization" → form (details, async user search for Organization admin and Members, Project tags, WMS workspace name; link "View org. admin profile").
- **Models** (`routes/adminRoutes/models/*`): all users' models in Orthophoto/Single tabs, search "Search for model or user", table Name (type icon, description), User, Last trained; detail = `SingleModel` in admin layout.

---

## 5. Forestry-specific vocabulary (where it appears)

| Term | Where |
|---|---|
| stems / "Est. Stems (Low/Medium/High)" / "pr ha" / "Stems/ha" | `utils/stemEstimates.js`, `utils/map/stemEnrichment.js`, `utils/map/hexagonTransform.js`, `sidebars/sidebarElements/HexagonAccordion.jsx`, `sidebars/summary/HexagonSummarySidebar.jsx`, `layers/detectionResults/Details.jsx`, `matrixFilter/matrixClassification.js`, `matrixFilter/useAvailableProperties.js` |
| trees / "detecting and counting trees" | `createModelModal/components/ModelTypeField.jsx`; "individual trees or stems" tooltip and "tree density" in `layers/singleImage/DspDetailsPanel.jsx`; "tree height classifications" comment in `components/CHMColorBar.jsx` |
| windfall (areas of windfall = windthrow) | `createModelModal/components/ModelTypeField.jsx` (segmentation example) |
| height / mean height / Height STD / "Height Model" (CHM) / "Height Classes" (coloured CHM) / Canopy Height Model | `utils/constants.js` MAP_LAYER_NAMES, `components/CHMColorBar.jsx`, hexagon accordion & summary, detection details/filter, matrix properties `mean_height` |
| canopy / crown / "Crown Diameter (m)" / `mean_crown_diameter` | `matrixClassification.js`, `dspColorFilter/useDspEnrichment.js`, `CHMColorBar.jsx` |
| density "(/dekar)" (per 1000 m²), "Hectare Equivalent", "Ha/eq" | `matrixClassification.js`, `useDspEnrichment.js`, `DspDetailsPanel.jsx`, `OverlayTooltips.jsx` ("/ N per ha") |
| volume "Volume (m³)", "Volume/ha (m³/ha)", "Volume Classification" preset | `matrixClassification.js`, `MatrixFilterMode.jsx`, `DspMatrixFilterMode.jsx` |
| basal area "Basal Area (m²)" | `matrixClassification.js` |
| biomass | not present |
| harvest-difficulty classes "Very Easy/Easy/Medium/Hard/Very Hard" with price/m²; "Allskog style" | `matrixClassification.js` DEFAULT_PRESET |
| species-like class names "coniferous", "leaf", "Tall", "Gran" (Norwegian: pine, spruce) as example per-class keys | `useAvailableProperties.js`, `useDspEnrichment.js` (examples only; classes are user-defined) |
| sample plots / "Digital Sample Plot" (DSP) / plots / "Detections per Plot" / "Total Plots" | `sidebars/LayerView.jsx`, `layers/singleImage/SingleImageFootprintsLayers.jsx`, `DspDetailsPanel.jsx`, `DspDetectionsPerPlotSidebar.jsx`, `dspExportUtils.js`, `utilityButtons/EditDetections.jsx` |
| hexagon size (m²) | `components/hexagonSize/HexagonSize.jsx`, `HexagonDataFields.jsx`, PDF/report utils, `filterTemplates.js` |
| GSD ("GSD cm", "Resolution cm/px", "Ignore GSD") | `sidebars/summary/SidebarSummary.jsx`, `matrixFilter/utils.js`, `dspExportUtils.js`, `newProject/.../AdvancedActions.jsx` (hidden) |
| altitude (GPSAltitude, RelativeAltitude) | `newProject/utils/exif.js` |
| terrain / "Terrain" (national DTM) / "Surface map" (DSM) / DSM / contours "Coarse 2m … Extra Fine 0.25m" | `utils/constants.js`, `sidebars/LayerView.jsx`, `config/contoursLayerConfig.js`, `layers/contours/*` |
| footprint / "Rough Estimate" / Laser Range Finder (LRF) | `layers/singleImage/EstimateWarning.jsx`, `OverlayTooltips.jsx`, `helpers.js` (`lrf_active`) |
| orthophoto / photogrammetry / processing preset `forest` | `utils/api/biodroneai.js`, `contexts/NewProject.context.jsx` |
| stumps, ruts, damage, harvest, timber, species (as labels) | **not present** in the recovered source — these would only exist as user-defined model class labels |

---

## 6. Third-party services and vendors

- **MapTiler** — satellite (`hybrid-v4`) and terrain (`outdoor-v2`) base map tiles; per-project API key from backend (`layers/baseMap/constants.js`, `utils/api/maptiler.js`).
- **OpenStreetMap** — "Standard" base map and the projects-overview map (`createLayers.js`, `newProject/components/map/layers.js`).
- **OpenLayers 10** — all mapping, WebGL vector layers, draw/modify/translate/snap/select interactions, KML/GeoJSON formats.
- **Sentry** (`utils/sentryConfig.js`) — browser tracing (10 %), session replay (10 % / 100 % on error), console-error capture; emails scrubbed; `/login`, `/register` request data filtered; only enabled when Cookiebot "statistics" consent is granted (reloads on consent change).
- **Cookiebot** — consent dialog, cookie declaration embed id `6006a5b0-0237-4595-8257-80d5f47422ac` (`PrivacyPolicy.jsx`, `utils/helpers.js`).
- **Google Tag Manager / Google Analytics, Facebook pixel, HubSpot (`api.hubapi.com`, `hscollectedforms`)** — only referenced as ignored domains in Sentry breadcrumbs/transactions and in the privacy policy text; no tag code in the recovered source.
- **Intercom Messenger** — described in the privacy policy; chatbot components are commented out in `Navigation.jsx`.
- **Stripe** — products (lookup keys), Checkout session, Billing Portal, subscription status; dashboard links in admin users table (`utils/api/stripe.js`, `components/products/*`, `components/subscription/*`).
- **AWS Cognito** — authentication provider per privacy policy; password rules mirror Cognito (`utils/validation/passwordRules.js`).
- **AWS S3** — all project files via pre-signed URLs through the file service (multipart upload, `filelink`); orthophoto XYZ tiles, thumbnails, GeoJSON, colormaps.
- **OpenDroneMap (ODM)** — photogrammetry engine: `odm_orthophoto/`, `odm_report/report.pdf`, `log.json`, "ODM Postprocess" admin action, "Fast Orthophoto" preset.
- **AWS SageMaker** — ML training/inference artefacts listed in admin "Sagemaker files".
- **SAM (Segment Anything)** — `use_sam: true` on predict-in-polygon; job type `segmentation_SAM`.
- **Cloudflare** — 52x error codes handled in `utils/httpClient.js`.
- Libraries: TanStack Query/Table, react-hook-form, react-bootstrap, styled-components, exifr, chart.js/react-chartjs-2, @react-pdf/renderer, docx + file-saver, polygon-clipping, dnd-kit, react-slick, react-range, react-dropzone, react-tooltip, date-fns, react-day-picker, p-limit, axios.

---

## 7. Relevant to a pre-/post-harvest site check

The portal is a generic drone-imagery + AI object-detection tool; it has no harvest-specific entities, but its features map onto a harvest site check as follows.

### (a) Pre-harvest check (before logging)
1. **Capture & create project**: fly the stand, upload JPGs (≥25, GPS EXIF required) as an *Orthophoto* project with the default `forest` preset (height calculations on) — or upload an existing GeoTIFF. Optionally "Create project and run detection" with a tree-detection model so detections are ready on completion. Single-image projects suit quick spot checks and DSP-style sampling.
2. **Boundaries & access**: use the *Satellite*/*Terrain* MapTiler base maps and the "Standard" OSM layer to see roads/tracks; the **Model boundary** (AOI) layer shows where a model has been run; **Contours** (0.25–2 m) and **Terrain** (national DTM) / **Surface map** (DSM) layers reveal slopes, gullies and likely wet hollows; **Measurement tools** give distances (skid-trail lengths, landing-to-road) and areas (e.g. proposed felling coupe, buffer zones) in metric/imperial. A measured polygon is not saved — note results in the matrix report "Project Notes".
3. **Retention trees / protected zones / standing stock**: run a *tree* object-detection base model ("Detect Objects" → draw the polygon) or train a custom model for e.g. "retention tree", "dead wood", "cultural feature"; inspect the **Center/Outline** detections, **Details** labels (height, area, diameter, confidence, stem estimates) and **Height Classes** (CHM legend) to locate the tallest/oldest trees; filter detections by height/diameter/confidence; export detections as **GeoJSON** for the harvester/GIS. **Hexagons** give per-cell count, mean height, stem estimates (stems/ha) and area for a stand table; the **Matrix filter** ("Mean Height × Density" → Very Easy…Very Hard with €/m²) is explicitly a harvest-difficulty/cost classification — save it as a template, attach notes, and export the **PDF/DOCX report** (map snapshot with scale bar, class areas, cost totals) or **KML/GeoJSON** of classified hexagons as the pre-harvest plan. Height/volume/basal-area properties (if the backend provides them) feed a "Volume Classification" simple filter.
4. **Wet areas / sensitive ground**: no dedicated wetness analytic; use DTM/contours plus a custom segmentation model (areas, e.g. "wet area", "windfall") trained via *Train AI* on tiles of the orthophoto.

### (b) Post-harvest audit (after logging)
1. **Re-fly and create a second project** over the same site (projects are independent; there is no built-in change-detection or time-slider — comparison is done by opening both projects, or by exporting GeoJSON/KML from each and overlaying externally, or by using the project *Area*/hexagon summaries side by side). Re-use saved filter templates so classifications are comparable.
2. **Stumps / remaining stems / retention trees**: train a custom *object-detection* model on the post-harvest orthophoto (classes such as "stump", "retained tree", "seed tree" — object size Small/Medium/Large), annotate tiles ("Train AI", ≥10 annotations over 6 tiles), then "Detect Objects" over the coupe. Compare detection counts/stem estimates per hexagon with the pre-harvest project; "Hexagons total summary" and "Breakdown by Classes" give counts and areas; use "Add/Remove Detections" (single-image projects) to correct counts and feed training data.
3. **Wheel ruts / driving damage / residual timber**: these are *areas*, so a custom **segmentation** model ("identify areas… e.g. areas of windfall") with classes like "rut", "brash pile", "timber remnants" is the intended path; segmentation outlines appear in the **Outline** layer with area in the Details tooltip; export GeoJSON for area totals. Contours/DSM on the post-harvest flight help spot rutting and drainage changes.
4. **Harvested area and compliance**: measure the cleared area with the Area tool or let hexagon "Total Area"/matrix class areas quantify it; the matrix/simple **Export Report** (area, % and optional price per class, notes, generated timestamp and analyst name) and the custom-filter **Generate PDF** act as the audit document. **Drone Images** layer lets an auditor click any capture point to open the original photo as evidence, and single-image **Footprints/DSP** show per-image sampled density (hectare equivalent) with an accuracy warning when no laser range finder was active.
5. **Traceability**: every detection/training job appears in **Notifications** with timestamps; model versions can be rolled back; admins can pull the ODM report/log and resource report per project.

Limitations to flag for a CFHarvest-style comparison: no multi-date change detection, no persistent user-drawn vector features (measurements are session-only), no WMS/WFS consumption in the client (only publish flags), no species/stump/rut vocabulary built in — all forestry semantics come from user-trained model classes plus the height/density/stem-estimate analytics.

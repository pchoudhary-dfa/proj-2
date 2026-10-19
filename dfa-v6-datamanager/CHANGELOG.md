# DFA DataManager — Changelog

**Product Name:** DFA DataManager
**Version:** V6
**Demo URL:** https://demo.datamanager.dfa6.dataforall.org
**Description:** DFA Data Manager is a data warehouse management application developed with the purpose of making the data management process seamless for the DW administrators.

---

All notable changes to this project are documented in this file.

---

## [6.0.16] - 2026-07-28
- Fixed the Subgroups, Classifications, and Areas pages allowing dimension/bulk-edit/level changes and saves without the corresponding update/create/delete permission; the affected buttons, drawer fields, and Save actions are now permission-gated.
- Implemented role-based post-login redirect for SSO: users with data-entry or data-review permission are sent directly to their dataset page instead of the default landing page.

## [6.0.15] - 2026-07-28
- Fixed the indicator config side panel allowing edits and save without update/create permission; fields and Save are now disabled for users without update rights.

## [6.0.14] - 2026-07-03
- Fixed an issue where users could appear logged out while still having an active session, causing the sidebar and user name to disappear.

## [6.0.13] - 2026-06-29
- Fixed the issue with the title and favicon in settings
- Implemented the Assign User functionality in workflow user assignment.
- Fixed the issues regarding the workflow sidebar component.

## [6.0.12] - 2026-06-29
- Fixed the overview page styling.
- Fixed the date range styling.

## [6.0.11] - 2026-06-25
- Implemented the operational reports.

## [6.0.10] - 2026-06-25
- Implemented the operational dashboard.
- Updated the data-points GET API end point for reviewer role.

## [6.0.9] - 2026-06-23

### Fixed
- Fixed the issue with workflow settings component for show previous time period and review level.
- Updated the order of columns in data-points table.

## [6.0.8] — 2026-06-19

### Added
- Workflow current time period selection in settings and dataset flow
- Source filtering on dataset data-points with adjusted-value toast notification

### Fixed
- Data Report filter summary chips aligned to shared `status-chip` styles
- Unit format legacy value handling on Units page; favicon MIME types in app configuration
- App configuration admin tab refreshes context after save

### Changed
- Dataset Flow import logs, readiness polling, and pending source NIDs on data-points grid

---

## [6.0.7] — 2026-06-12

### Added
- Analytical and Quality Report pages with sidebar report type selection
- Mobile app publish data, package history, and PWA install support
- Products tab in App Configuration for API client management
- Advanced filters, column visibility, and serial number column on report pages
- Dataset completeness percentage on dataset list; CRUD permissions for mobile app publishing
- Import logs and datapoint readiness on Dataset Flow; system subgroup rows protected from edit/delete

### Fixed
- Data Report filter bar styling and collapse-on-apply behavior
- Auth return URL handling; workflow role selection in settings
- Review stage indicators use dot badges

### Changed
- DFA v6 styleguide alignment across header, cards, pagination, and status chips
- Report filter controls use SelectField and TextField; dataset list dates show date only

---

## [6.0.6] — 2026-06-03

### Added
- Data Report page with filters, server-side search/sort, XLSX export, and persisted filters
- Resizable columns on editable grid headers and data-points table
- Indicator validation rules on dataset data-points grid
- Email verification resend for pending registrations
- Data value filtering on Data Report page

### Fixed
- Action column width consistency across grids
- IuTreeView hierarchical classification and checkbox selection state
- API client signing key moved to server-side `DM_API_SIGNING_PRIVATE_KEY`

### Changed
- Dataset and data-points tables use ServerDrivenListTbody for rendering
- Workflow grid resizable columns and pending-state handling on settings

---

## [6.0.5] — 2026-06-02

### Added
- Inline subgroup editing on Subgroups page
- Subgroup removal confirmation modal on Indicator page
- Data-point comment counts in dataset grid and flow page
- Compute engine process type icons on execute and indicator tabs

### Fixed
- Compute engine log list and detail column widths, summary alignment, and execution sort order
- Workflow grid column widths for localized headers, filters, and action columns
- SSO runtime configuration from app config; redirect URLs include application key

### Changed
- DFA v6 shared style guide integrated; `globals.css` consolidated
- TableActionButton menu uses portal positioning; SideNavTruncatingLabel supports expanded text

---

## [6.0.4] — 2026-05-26

### Added
- Help renderer with multi-language support and improved type definitions (DFAV6-819)
- Help panel available on every page across the application
- Profile page: edit for account fields ie First Name , Last Name etc with validation 

### Fixed
- Profile page: redesigned account and audit sections with responsive grid, section icons, consistent borders, role permissions panel, and i18n for all strings
- Dataset data-points table grid alignment with shared tv-grid patterns
- Fixed header scroll issue in the data-points table
- Unit format handling added to UnitsPage and related components (DFAV6-7621)
- Fixed DFAV6-792: data-points related issue
- Fixed DFAV6-762: upper case consistency in labels

### Changed
- User management enhancements: role selection dropdown in Users panel, improved sidebar context with warehouse options
- Bulk edit button icon and markup updated in IndicatorClassifications and Subgroups pages

---

## [6.0.3] — 2026-05-22

### Added
- SSO logout support
- Textarea field added for relevant form inputs
- Version log page added to Header and Sidebar with routing and translations

### Fixed
- Build error resolved (fix/buildError)
- Layout and sidebar hydration issues resolved for consistent rendering
- Upper case label inconsistencies fixed across multiple pages (DFAV6-762)
- Favicon handling refactored in AppConfigContext to manage multiple icon types dynamically; increased file size limits for favicon and logo uploads

### Changed
- Button styles refactored in `globals.css`; introduced new icon button classes for consistency across IndicatorMetadataTab, SubgroupsPage, and other components
- WorkFlowSettingsComponent enhanced with memoized role codes and improved table header rendering
- EditableDataGridThead refactored for cleaner header and filter integration
- Sidebar provider keys updated for better component identification; unused favicon references removed from layout

---

## [6.0.2] — 2026-05-21

### Added
- SSO support in login component: added `renderAfterSubmit` prop, SSO buttons, and divider styles; environment variables updated for SSO configuration
- Help icon added on every page via Info icon integration
- User chips added in role name display; active status shown in green

### Fixed
- Pagination fixed across relevant pages
- Fixed DFAV6-755, DFAV6-758, DFAV6-760, DFAV6-761, DFAV6-762: various UI and data issues in user/role management
- Delete button color fixed
- Layout and checkbox CSS fixed
- Font styling corrections
- Package lock file updated to resolve dependency inconsistency

---

## [6.0.1] — 2026-05-19

### Added
- Import/Export functionality for Indicator Classifications (IC) and IUS data
- Config tab implementation for dataset workflow settings
- Area import feature with level-restricted selection support
- Locale change option added to the application header
- Docker optimization configuration (`feature/opt-docker`)
- DFA Help Admin integration: content management, help panel per page, API URL updates
- Language file export and import support
- Bulk delete confirmation modal in WorkflowPage
- Permission guard implemented across multiple pages for role-based access control
- Time period annually option added to workflow settings
- Status chip component integrated into DatasetDataPointsTable and DatasetListTable
- Password reset and reset confirmation flow added to login

### Fixed
- DFAV6-703: breadcrumb main tab consistency fix
- DFAV6-705: sidebar ordering and logging corrections
- DFAV6-700, DFAV6-702, DFAV6-695, DFAV6-708: dataset and workflow bug fixes
- Translation import logic simplified; trailing slash inconsistency in app-config PATCH API fixed
- CommentPanel comment locking behavior improved
- Sidebar auto-collapse in DatasetFlowPage on load

### Changed
- Translation keys refactored across Compute Process and related components for improved localization
- Workflow design updated: sorting, filtering, review levels in normalization, enhanced dataset actions
- DatasetFlowPage refactored: data point management, review filter state, dataset drawer handling, multi-dataset deletion
- User management: roles and users panel ordering adjusted; warehouse options added to sidebar context
- DW-scoped permissions stored and managed via local storage utility functions
- Translations management page: replaced Modal with DeletePermanentConfirmModal for delete confirmations

---

## [6.0.0] — 2026-03-26

### Added
- Initial application release with upgraded to
- Front-end: Next.js
- Back-end Database: MySql
- Back-end API: FastAPI

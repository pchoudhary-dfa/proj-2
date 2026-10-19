# DFA Help Admin Package

## 📋 Project Overview

**DFA Help Admin** is a reusable npm package that exports a React component `<DFAHelpAdmin />` for managing DFA Help Service content through an intuitive admin interface.

## 🎯 Business Context

The DFA Help Service platform requires a content management interface for administrators to:
- Manage help content across multiple adaptations
- Edit content in multiple languages
- Organize content in hierarchical structures
- Maintain content relationships and metadata

## 📋 Original Requirements

### Package Purpose
Create a new reusable npm package called `dfa-help-admin` that exports a React component `<DFAHelpAdmin />`.

### UI Structure Requirements

#### **Header**
- Fixed title: "DFA Help Service"

#### **Left Panel**
- A dropdown menu that fetches options from the API: `https://help-api.dataforall.org/api/adaptations`
  - API returns JSON with `data` attribute containing array of objects
  - Each object has `id`, `code`, and `name` attributes
  - Use `name` for option label and `id` for value
- When user selects an adaptation, fetch parent/children keys from: `https://help-api.dataforall.org/api/keys?adaptation_id={selectedId}`
  - API returns JSON with `data` attribute containing array of objects
  - Each object structure:
    ```json
    {
      "id": 1,
      "key": "BYD-DASH",
      "code": "DASH",
      "related_keys": [],
      "parent_id": null,
      "title": "Dashboards",
      "children": []
    }
    ```
- Display fetched list under dropdown in tree-like structure (parents → children)
- **Default Selection**: First adaptation should be selected by default
- **Tree View Features**:
  - **Expand/Collapse**: Plus/minus icons (➕/➖) for nodes with children
  - **Default State**: Tree view collapsed by default
  - **Clean Interface**: No folder/file icons, no "Keys Structure" heading, no `(code)` display
  - **Delete Functionality**: Each tree item has right-aligned delete icon (🗑️)
    - Clicking delete icon shows confirmation dialog
    - If confirmed, calls `https://help-api.dataforall.org/api/delete?id={selectedId}`
    - Removes deleted record from tree view after successful deletion
  - **Create New Items**: Input box under each level (except top level) for adding new items
    - One input box per level, not per item
    - Click "➕ Add Item" button to show input field
    - Type item title and press Enter to create
    - Press Escape to cancel
    - Automatically calls `https://help-api.dataforall.org/api/create` with payload:
      ```json
      {
        "adaptation_id": number,
        "parent_id": number,
        "title": string
      }
      ```
    - Refreshes tree view to show newly created item
  - **Node Selection**: Clicking on a node fetches detailed data from `/api/keydata/{keyId}`
  - **Visual Hierarchy**: Clear parent-child relationships with proper indentation

#### **Body Panel**
- **Dynamic Title**: Shows selected node's key title + ">> Edit Content"
- **Content Area**: Placeholder when no node is selected
- **Form Interface**: Multi-language content editing when node is selected
  - **Language Support**: 6 languages (English, French, Spanish, Arabic, Portuguese, Russian)
  - **Default Language**: English (`en`)
  - **Input Fields**:
    - **Field Code**: Max 10 chars, mandatory, from `code` attribute
    - **Title**: Mandatory, from `translations[locale].title`
    - **Description**: HTML editor, mandatory, from `translations[locale].desc`
    - **Purpose**: HTML editor, optional, from `translations[locale].purpose`
    - **Related Keys**: From `related_keys` array, convert to comma-separated string
      - Handles objects with `{key: "value", translations: [...]}` structure
      - Extracts the `key` property from each object
      - Falls back to other properties (name, title, code, id) if key not available
      - User can edit the comma-separated string in the form
  - **Save Key Button**: Generates key automatically
    - Top level: Adaptation code + "-" + Item Code
    - Children: Parent Key + "-" + Item Code
    - Display generated key after button with grey background
    - Display `key` attribute from API response after "Save Key" button
    - **Automatically saves data** when Save Key is clicked
    - Post the data to `https://help-api.dataforall.org/api/update` with following payload format
    ```json
    {
        "code": "DASH",
        "desc":"",
        "id":1,
        "key":"BYD-DASH",
        "lang":"en",
        "purpose":"",
        "related_keys": "",
        "title":"Dashboards"
    }
    ```
    - Once saved successfull and title was changed, then need to change the same title in the tree view to selected item

#### **Footer**
- Simple footer with hardcoded version "v2.0.0"

### API Requirements

#### **Authentication**
- All API calls must include bearer token in Authorization header
- Token: `eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJodHRwczovL2hlbHAtYXBpLmRhdGFmb3JhbGwub3JnL2FwaS9sb2dpbiIsImlhdCI6MTc1NTg0MzcwOSwiZXhwIjoxNzg3Mzc5NzA5LCJuYmYiOjE3NTU4NDM3MDksImp0aSI6IndQS2c0N2hRaWI0aHlmRDIiLCJzdWIiOiIxIiwicHJ2IjoiMjNiZDVjODk0OWY2MDBhZGIzOWU3MDFjNDAwODcyZGI3YTU5NzZmNyJ9.k_0Iuu7kHXZFNBj2AZIwqgG23kCEZDxHJAmQ5e7rnQ`

#### **API Endpoints**
- **GET** `/api/adaptations` - Fetch adaptations list
- **GET** `/api/keys/{adaptation_id}` - Fetch content tree
- **GET** `/api/keydata/{keyId}` - Fetch detailed content data
- **PUT** `/api/update/{key_id}` - Update content
- **DELETE** `/api/delete/{key_id}` - Delete content records

### Technical Requirements

#### **API Configuration**
- **Configurable API Base URL**: Hosting application can provide custom endpoint
- **Configurable Bearer Token**: Hosting application can provide custom authentication
- **Default Fallbacks**: Production endpoints used if not specified
- **Environment Support**: Development, staging, and production configurations

#### **HTML Editor**

The component includes a custom HTML editor for Description and Purpose fields with the following features:

- **Rich Text Formatting**: Bold, Italic, Underline
- **List Support**: Bullet points and numbered lists
- **Link Insertion**: Add hyperlinks to content
- **Heading Support**: H1 and H2 headings
- **Content Preservation**: Prevents cursor jumping issues
- **Real-time Updates**: Content is automatically saved to form state

**Advanced HTML Editor Features:**

- **HTML Code Control**: 
  - Toggle between rich text and HTML code views
  - Edit raw HTML code directly in the editor
  - Apply HTML changes with dedicated "Apply" button
  - Automatic HTML entity escaping/unescaping
  - Content preservation during mode switches

- **Image Insertion**:
  - **Copy & Paste Images**: Paste images directly from clipboard with automatic base64 conversion
  - **Drag & Drop Images**: Drag image files from computer to editor
  - **URL Input**: Manual image URL entry option
  - **Base64 Conversion**: Images automatically converted to inline base64 strings
  - **Alt Text Support**: Optional accessibility descriptions for images
  - **Responsive Styling**: Images automatically scale to fit container
  - **Visual Feedback**: Drag-over states and hover effects

- **Class Management**:
  - **Title Class**: Apply `dfaHelpTitleOFEditor` class to selected text
  - **Clear Class**: Remove all classes from selected text
  - **Smart Selection**: Only works on selected text with validation
  - **Automatic Wrapping**: Wraps text in span elements with appropriate classes
  - **Form Integration**: Changes automatically update form data

**Note**: The HTML editor uses native `contentEditable` functionality with custom formatting controls, providing a smooth editing experience without external dependencies. All new features maintain the same high-quality user experience with proper error handling and visual feedback.

#### **CSS Classes and Styling**

The HTML Editor includes several CSS classes for consistent styling and user experience:

- **`dfaHelpTitleOFEditor`**: Applied to title text for consistent styling
  ```css
  .dfaHelpTitleOFEditor {
    font-size: 15px;
    text-align: left;
    margin-top: 10px;
    color: #510c0c;
    font-weight: 500;
  }
  ```

- **`toolbar-select`**: Styling for the class dropdown in the toolbar
  - Clean borders and rounded corners
  - Hover effects with blue border
  - Focus states with blue outline and shadow
  - Consistent with other toolbar elements

- **`html-code-mode`**: Styling for HTML code view
  - Monospace font for better code readability
  - Light background with proper spacing
  - HTML entities properly displayed

- **`drag-over`**: Visual feedback for drag and drop operations
  - Dashed blue border during drag operations
  - "Drop image here" message overlay
  - Smooth transitions and animations

#### **Technical Implementation Details**

**HTML Code Control:**
- **Mode Toggle**: `toggleHtmlCode()` function switches between rich text and HTML code views
- **Content Preservation**: Uses `dataset` attributes to store content in both modes
- **HTML Escaping**: Automatically escapes `<`, `>`, `&`, `"`, and `'` characters
- **Apply Functionality**: `applyHtmlChanges()` function converts HTML entities back to actual HTML

**Image Insertion:**
- **Paste Handler**: `handlePaste()` function detects image data in clipboard
- **Drag & Drop**: `handleDrop()` function processes dropped image files
- **Base64 Conversion**: Uses `FileReader.readAsDataURL()` for inline image storage
- **File Validation**: Checks file type to ensure only images are processed
- **Alt Text Support**: Prompts user for accessibility descriptions

**Class Management:**
- **Selection Validation**: `handleClassChange()` function validates text selection
- **Span Wrapping**: Creates/removes span elements with appropriate classes
- **Form Integration**: Triggers input events to update form data automatically
- **Error Handling**: User-friendly alerts for invalid operations

**Event Handling:**
- **Paste Events**: `onPaste` handler for clipboard image insertion
- **Drag Events**: `onDragOver`, `onDragLeave`, `onDrop` for file operations
- **Class Changes**: `onChange` handler for dropdown class selection
- **Form Updates**: Automatic form data synchronization with editor content

#### **Loading States**
- Replace "Loading..." text with floating loader icon
- Prevent layout shifts during loading

#### **Responsive Design**
- Mobile-friendly interface
- Tree view adapts to different screen sizes
- Form tabs wrap appropriately on smaller screens

#### **Error Handling**
- Show inline validation errors
- Display success/error messages after operations
- Handle API errors gracefully

### Data Structure Requirements

#### **API Response Format for Key Data**
```json
{
  "data": {
    "id": "",
    "code": "",
    "key": "",
    "parentKey": "",
    "parent_id": "",
    "related_keys": [],
    "title": "",
    "translations": [
      {
        "locale": "",
        "title": "",
        "desc": "",
        "purpose": ""
      }
    ]
  }
}
```

#### **Form Population Logic**
- Fill Code field from `code` attribute
- Display `key` attribute value after "Save Key" button
- Fill Related Keys from `related_keys` array (convert to comma-separated string)
- Find translation where `translations[i].locale === selectedLanguage`
- Fill Title from `translation.title`
- Fill Description from `translation.desc`
- Fill Purpose from `translation.purpose`

### Key Generation Logic

The component automatically generates keys using the following logic:

- **Top level keys**: `Adaptation Code + "-" + Item Code` (e.g., `BYD-DASH`)
- **Child keys**: `Parent Key + "-" + Item Code` (e.g., `BYD-DASH-ADDASH`)

**Note**: For child items, the system uses the parent's **Key** (not Code) to generate the child key, ensuring proper hierarchical relationships.

### Key Display

The API Key panel is always visible and displays content based on two different scenarios:

1. **When selecting an item in tree view**: Shows the existing API Key from the selected node
2. **When clicking Generate Key button**: Shows the newly generated key that was just created

**Note**: The panel automatically switches between showing the existing key (when a node is selected) and the generated key (after clicking Generate Key), providing clear feedback about the current state.

**Single Action Button**: The "Generate Key" button automatically generates the key and saves the data in one action, providing a streamlined user experience.

**User Feedback**: After successful save, a single clear message "Key saved successfully!" is displayed to confirm the operation.

### Form Fields

The form includes the following fields:

- **Code (10)** - Mandatory field with maximum 10 characters limit
- **Title** - Mandatory field for the key title
- **Description (HTML)** - Mandatory HTML editor field for detailed description
- **Purpose (HTML)** - Optional HTML editor field for purpose information
- **Related Keys** - Optional field for capturing related keys

**Note**: Code, Title, and Description fields are mandatory and must be filled before the "Generate Key" button becomes active.

## 🔄 Implementation History

### Features Implemented
- ✅ Basic package structure with Rollup build
- ✅ DFAHelpAdmin component with header, left panel, body panel, footer
- ✅ Adaptation dropdown with API integration
- ✅ **Tree View with Advanced Features**:
  - ✅ Hierarchical display of parent-child relationships
  - ✅ Expand/collapse functionality with plus/minus icons (➕/➖)
  - ✅ Default collapsed state for better UX
  - ✅ Clean interface (no folder/file icons, no code display, no headings)
  - ✅ Delete functionality with confirmation dialog
  - ✅ **Create new items functionality with input boxes**
  - ✅ Node selection for detailed data fetching
  - ✅ Visual hierarchy with proper indentation
- ✅ Node selection and detailed data fetching from `/api/keydata/{keyId}`
- ✅ Multi-language support (6 languages: en, fr, es, ar, pt, rs)
- ✅ **Enhanced HTML Editor with Advanced Features**:
  - ✅ Basic formatting controls (Bold, Italic, Underline, Lists, Links, H1, H2)
  - ✅ **HTML Code Control**: Toggle between rich text and HTML code views
  - ✅ **Image Insertion**: Copy/paste, drag & drop, and URL input with base64 conversion
  - ✅ **Class Management**: Apply/remove `dfaHelpTitleOFEditor` class to selected text
  - ✅ Content preservation and cursor jumping prevention
  - ✅ Real-time form updates and validation
- ✅ Form validation and error handling
- ✅ Save Key functionality (Implemented according to docs - Generate key, display generated/API keys)
- ✅ Save functionality with API integration to `/api/update`
- ✅ Delete functionality with confirmation and API call to `/api/delete`
- ✅ Loading spinner and responsive design
- ✅ Configurable API endpoints and bearer tokens via props
- ✅ Configurable header visibility via `showHeader` prop (default: false)

### Current Status
The package is fully functional and meets all the original requirements. It provides a complete content management interface for the DFA Help Service platform with multi-language support, **enhanced HTML editing capabilities**, and full CRUD operations. 

**HTML Editor Capabilities:**
- **Professional Content Creation**: Rich text formatting, HTML code editing, and image management
- **Advanced Image Handling**: Copy/paste, drag & drop, and URL-based image insertion with automatic base64 conversion
- **Class Management**: Easy application and removal of custom CSS classes for consistent styling
- **Code View**: Toggle between rich text and raw HTML editing modes
- **Content Preservation**: No data loss during mode switches or formatting operations

**Tree View Features:**
- **Hierarchical Management**: Full parent-child relationship management with expand/collapse functionality
- **Content Operations**: Create, read, update, and delete operations with API integration
- **Visual Design**: Clean, professional interface with intuitive navigation
- **Real-time Updates**: Automatic refresh and state management

The tree view feature is fully implemented with expand/collapse, delete functionality, create new items, and clean visual design. The HTML Editor now provides enterprise-level content creation capabilities comparable to professional CMS platforms.

## 📚 Documentation Files

- **`DOCUMENTATION.md`** - Complete package documentation for users
- **`QUICK_REFERENCE.md`** - Developer quick reference guide
- **`PRD.md`** - Product requirements document
- **`docs/README.md`** - Documentation navigation index

---

*This document captures the original context and requirements for creating the DFA Help Admin package. It serves as a reference for understanding the project's purpose and scope.*

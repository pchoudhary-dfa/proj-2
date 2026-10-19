# Product Requirements Document (PRD)
## DFA Help Service Package

### 1. Executive Summary

The **DFA Help Service** is a reusable React component package designed to provide a comprehensive interface for managing Data For All (DFA) help content. This package enables users to browse, edit, and manage hierarchical help documentation through an intuitive tree-view interface with multi-language support.

### 2. Product Context

#### 2.1 Background
Data For All (DFA) is a platform that provides comprehensive help documentation and support services. The platform requires a standardized interface for content creators and administrators to manage help content across different adaptations and languages.

#### 2.2 Problem Statement
- **Content Management Complexity**: Managing help content across multiple adaptations and hierarchical structures is time-consuming and error-prone
- **Language Localization**: Supporting multiple languages requires a consistent interface for content editors
- **Integration Challenges**: Different projects need to integrate the same help management functionality without rebuilding from scratch
- **User Experience**: Content editors need an intuitive interface that reduces training time and improves productivity

#### 2.3 Solution Overview
A reusable React component package that provides:
- **Tree-view navigation** for hierarchical content management
- **Multi-language support** for international content
- **Form-based editing** with validation and auto-generation
- **API integration** with DFA help services
- **Responsive design** for various screen sizes

### 3. Product Requirements

#### 3.1 Functional Requirements

##### 3.1.1 Core Features
- **Adaptation Selection**: Dropdown to select from available DFA adaptations
- **Tree View Navigation**: Hierarchical display of help content keys
- **Content Editing**: Form-based interface for editing help content
- **Multi-language Support**: Tabbed interface for different language versions
- **Auto-key Generation**: Automatic generation of content keys based on hierarchy
- **API Integration**: Seamless integration with DFA help API endpoints

##### 3.1.2 User Interface Components
- **Header**: Fixed title "DFA Help Service"
- **Left Panel**: Adaptation selector and tree view
- **Body Panel**: Content editing forms
- **Footer**: Version information

#### 3.2 Non-Functional Requirements

##### 3.2.1 Performance
- **Load Time**: Component should render within 2 seconds
- **API Response**: API calls should complete within 3 seconds
- **Memory Usage**: Efficient memory management for large content trees

##### 3.2.2 Usability
- **Responsive Design**: Works on desktop, tablet, and mobile devices
- **Accessibility**: WCAG 2.1 AA compliance
- **Internationalization**: Support for RTL languages and various character sets

##### 3.2.3 Reliability
- **Error Handling**: Graceful error handling with user-friendly messages
- **Offline Support**: Basic offline functionality for content viewing
- **Data Validation**: Client-side validation to prevent invalid submissions

### 4. Technical Specifications

#### 4.1 Architecture
- **Component-based**: Built using React functional components with hooks
- **TypeScript**: Full type safety and IntelliSense support
- **CSS Modules**: Scoped styling to prevent conflicts
- **ES Modules**: Modern JavaScript module system

#### 4.2 Dependencies
- **React**: >=16.8.0 (for hooks support)
- **React DOM**: >=16.8.0
- **HTML Editor**: react-simple-wysiwyg for rich text editing

#### 4.3 Build System
- **Rollup**: Modern bundler for optimal package size
- **TypeScript**: Compilation and type generation
- **CSS Processing**: CSS copying and optimization

### 5. API Integration

#### 5.1 Endpoints
- **GET** `/api/adaptations` - Fetch available adaptations
- **GET** `/api/keys?adaptation_id={id}` - Fetch content keys for adaptation
- **POST** `/api/update` - Update help content

#### 5.2 Data Structures
- **Adaptation**: `{ id, code, name }`
- **KeyNode**: `{ id, key, code, title, description, purpose, related_keys, parent_id, children }`
- **UpdatePayload**: `{ key, lang, title, desc, purpose, related_keys }`

### 6. User Experience

#### 6.1 User Journey
1. **Selection**: User selects an adaptation from dropdown
2. **Navigation**: Tree view displays hierarchical content structure
3. **Editing**: Clicking a node opens editing form
4. **Content Management**: User edits content in multiple languages
5. **Saving**: Auto-generated keys and validation before submission
6. **Confirmation**: Success/error feedback to user

#### 6.2 Key User Benefits
- **Efficiency**: Streamlined content management workflow
- **Consistency**: Standardized interface across projects
- **Quality**: Built-in validation and error prevention
- **Flexibility**: Multi-language and hierarchical content support

### 7. Success Metrics

#### 7.1 Adoption Metrics
- **Package Downloads**: NPM download statistics
- **GitHub Stars**: Community interest and adoption
- **Issue Reports**: Quality and maintenance indicators

#### 7.2 Usage Metrics
- **Component Usage**: Number of projects integrating the package
- **API Calls**: Volume of help content updates
- **User Feedback**: Satisfaction scores and feature requests

### 8. Future Enhancements

#### 8.1 Phase 2 Features
- **Bulk Operations**: Multi-select and batch editing
- **Version Control**: Content versioning and rollback
- **Search & Filter**: Advanced content discovery
- **Analytics**: Usage analytics and content performance

#### 8.2 Long-term Vision
- **AI Integration**: Smart content suggestions and auto-completion
- **Collaboration**: Multi-user editing with conflict resolution
- **Workflow Management**: Approval processes and publishing workflows
- **Integration Hub**: Connectors for popular CMS platforms

### 9. Risk Assessment

#### 9.1 Technical Risks
- **API Changes**: DFA API modifications may require package updates
- **Browser Compatibility**: Ensuring support across different browsers
- **Performance**: Large content trees may impact rendering performance

#### 9.2 Mitigation Strategies
- **Version Pinning**: Lock API versions to prevent breaking changes
- **Progressive Enhancement**: Graceful degradation for older browsers
- **Virtualization**: Implement virtual scrolling for large datasets

### 10. Conclusion

The DFA Help Service package addresses a critical need for standardized help content management across the Data For All ecosystem. By providing a reusable, well-tested component, we enable faster integration, improved user experience, and consistent content management workflows.

This package serves as a foundation for building comprehensive help systems and can be extended to support additional use cases as the platform evolves.

---

**Document Version**: 1.0  
**Last Updated**: December 2024  
**Owner**: DFA Development Team  
**Stakeholders**: Content Managers, Developers, End Users

PROMPT
I want to create a new reusable npm package called dfa-help-admin that will be used in a Next.js project.

The package should export a React component <DFAHelpService /> that renders a UI with the following structure:

1. Header

Fixed title: “DFA Help Service”

2. Left Panel

A dropdown menu that fetches options from the API:
https://help-api.dataforall.org/api/adaptations

API response structure:

{
  "data": [
    { "id": 1, "code": "BYD", "name": "Byd Adaptation" },
    ...
  ]
}


The name field should be used as the dropdown label.

The id field should be used as the dropdown value.

When the user selects an adaptation:

Fetch the list of keys from:
https://help-api.dataforall.org/api/keys?adaptation_id={selectedId}

Example response structure:

{
  "data": [
    {
      "id": 1,
      "key": "BYD-DASH",
      "code": "DASH",
      "related_keys": [],
      "parent_id": null,
      "title": "Dashboards",
      "children": [
        {
          "id": 123,
          "key": "BYD-DASH-ADDASH",
          "code": "ADDASH",
          "related_keys": "",
          "parent_id": "1",
          "title": "Add Dashboard",
          "children": []
        }
      ]
    }
  ]
}


Display the fetched list in a tree view (parent → children).

3. Body Panel

Placeholder area (just say “Content Area” by default).

When a node from the tree view is clicked:

Show a form with tabs for languages (default tab = en).

Input fields:

Field Code (10)

Name: code

Input box with max length = 10 chars

Mandatory

Pre-filled with code from the tree view JSON object

Title

Name: title

Mandatory

Description (HTML)

Name: desc

Rich text editor

Mandatory

Purpose (HTML)

Name: purpose

Rich text editor

Optional

Related Keys

Name: related_keys

Input box (comma separated if multiple)

Save Key Button:

On click, generate a key automatically using:

Top-level keys: Adaptation code + Key Code (10)

Child keys: Parent Code + Key Code (10)

The generated key should be displayed after the button (in grey background).

Payload must include:

"key" (the generated key)

"lang" (the selected language)

Call API:
POST https://help-api.dataforall.org/api/update

4. Footer

Simple footer with hardcoded version: v2.0.0

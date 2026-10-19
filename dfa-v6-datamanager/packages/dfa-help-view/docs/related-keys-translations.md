# Related Keys with Translations - Version 2.0.4

## 🚀 **New Feature: Related Keys with Translations**

### **Updated JSON Structure:**
The `related_keys` array now supports objects with translations:

```json
{
  "data": {
    "id": 89,
    "key": "NIS-SETUP-FUNCTIONAL-RATE-CARD",
    "code": "FUNCTIONAL-RATE-CARD",
    "parentKey": "NIS-SETUP",
    "parent_id": 45,
    "related_keys": [
      {
        "key": "NIS-SETUP", 
        "translations": [{
          "locale": "en", 
          "title": "Configure"
        }]
      }
    ],
    "title": "Functional Rate Card",
    "translations": [
      {
        "locale": "en",
        "title": "Functional Rate Card",
        "desc": "<p>Help content here</p>",
        "purpose": "Purpose of this help item"
      }
    ]
  }
}
```

## 🔧 **Technical Implementation:**

### **1. Updated TypeScript Types:**

```typescript
// New interface for related keys with translations
export interface DFAHelpRelatedKey {
  key: string;
  translations?: DFAHelpTranslation[];
}

// Updated main data interface
export interface DFAHelpData {
  // ... other fields
  related_keys: (string | DFAHelpRelatedKey)[];
  // ... other fields
}

// New interface for processed related keys
export interface ProcessedRelatedKey {
  key: string;
  title: string;
}

// Updated processed data interface
export interface ProcessedHelpData {
  // ... other fields
  relatedKeys: ProcessedRelatedKey[];
  // ... other fields
}
```

### **2. Enhanced Data Processing:**

The `processHelpData` function now handles both string and object related keys:

```typescript
const processHelpData = useCallback((data: DFAHelpData, language: string): ProcessedHelpData => {
  // Process related_keys with translations
  const relatedKeys: ProcessedRelatedKey[] = (data.related_keys || []).map(key => {
    if (typeof key === 'string') {
      return { key, title: key };
    }
    
    if (key && typeof key === 'object' && key !== null) {
      const relatedKey = key as DFAHelpRelatedKey;
      const keyString = relatedKey.key || String(key);
      
      // Find translation for the related key
      if (relatedKey.translations && relatedKey.translations.length > 0) {
        const relatedTranslation = relatedKey.translations.find(t => t.locale === language) || relatedKey.translations[0];
        return {
          key: keyString,
          title: relatedTranslation?.title || keyString
        };
      }
      
      return { key: keyString, title: keyString };
    }
    
    return { key: String(key || ''), title: String(key || '') };
  }).filter(relatedKey => relatedKey.key);
  
  // ... rest of processing
}, []);
```

### **3. Updated UI Rendering:**

The HelpPanel component now displays the translated title instead of the raw key:

```typescript
{processedData.relatedKeys.map((relatedKey, index) => {
  if (!relatedKey.key) return null;
  
  return (
    <div 
      key={index} 
      className={styles.relatedKey}
      onClick={() => onRelatedKeyClick?.(relatedKey.key)}
      style={{ cursor: 'pointer' }}
      title={`Click to view help for: ${relatedKey.title}`}
    >
      <span className={styles.keyCode}>{relatedKey.title}</span>
    </div>
  );
})}
```

## 🎯 **User Experience:**

### **Display Logic:**
1. **With Translation**: Shows the translated title (e.g., "Configure" instead of "NIS-SETUP")
2. **Without Translation**: Falls back to showing the key itself
3. **Language Support**: Automatically uses the current language or falls back to the first available translation
4. **Click Functionality**: Still uses the original key for API calls, but displays the user-friendly title

### **Visual Example:**
```
Before: [NIS-SETUP] [USER-MANAGEMENT] [REPORTING]
After:  [Configure] [User Management] [Reporting]
```

## 📋 **Features Summary:**

| Feature | Status | Description |
|---------|--------|-------------|
| **Related Keys with Translations** | ✅ Complete | Support for objects with key and translations |
| **Fallback to Key** | ✅ Complete | Shows key if no translation available |
| **Language Support** | ✅ Complete | Uses current language or first available |
| **Backward Compatibility** | ✅ Complete | Still supports string-based related keys |
| **Click Functionality** | ✅ Complete | Uses original key for API calls |
| **User-Friendly Display** | ✅ Complete | Shows translated titles in UI |

## 🔄 **Backward Compatibility:**

The system maintains full backward compatibility:

```json
// Still supports simple string arrays
"related_keys": ["KEY-1", "KEY-2", "KEY-3"]

// Now also supports objects with translations
"related_keys": [
  "KEY-1",  // Simple string (fallback)
  {         // Object with translations
    "key": "KEY-2",
    "translations": [{
      "locale": "en",
      "title": "User Management"
    }]
  }
]
```

## 🎨 **Display Examples:**

### **English (en):**
- Key: "NIS-SETUP" → Display: "Configure"
- Key: "USER-MGMT" → Display: "User Management"
- Key: "REPORTS" → Display: "Reports"

### **Spanish (es):**
- Key: "NIS-SETUP" → Display: "Configurar"
- Key: "USER-MGMT" → Display: "Gestión de Usuarios"
- Key: "REPORTS" → Display: "Reportes"

### **Fallback:**
- Key: "UNKNOWN-KEY" → Display: "UNKNOWN-KEY" (no translation available)

## 🚀 **Usage:**

```javascript
// The component automatically handles the new structure
<DFAHelpRenderer helpKey="your-help-key" />

// Related keys will now display user-friendly titles
// while maintaining full navigation functionality
```

## ✅ **Testing:**

### **Test Cases:**
- ✅ **String Related Keys** - Backward compatibility maintained
- ✅ **Object Related Keys** - New structure supported
- ✅ **With Translations** - Displays translated titles
- ✅ **Without Translations** - Falls back to key display
- ✅ **Language Switching** - Updates related key titles
- ✅ **Click Navigation** - Uses original keys for API calls
- ✅ **Mixed Arrays** - Handles both string and object types

## 📦 **Version:**
- **Current**: 2.0.4
- **Status**: Related keys with translations fully implemented
- **Ready**: For production use

The related keys now support translations while maintaining full backward compatibility! 🎉

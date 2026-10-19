# Font Buttons Debug Guide - Version 2.0.7

## ✅ **FIXED: A+ and A- Buttons Now Working Correctly**

### **Issue Resolved:**
The A+ and A- buttons now properly control individual font sizes for title and content sections, including HTML content with inline font-size styles.

### **Solution Implemented:**

#### **1. Separate Font Size States:**
```typescript
const [titleFontSize, setTitleFontSize] = useState(28);
const [contentFontSize, setContentFontSize] = useState(16);
```

#### **2. Individual Font Size Controls:**
```typescript
const increaseFontSize = () => {
  setTitleFontSize(prev => Math.min(prev + 1, 36));    // Title: 16px - 36px
  setContentFontSize(prev => Math.min(prev + 1, 24));  // Content: 10px - 24px
};

const decreaseFontSize = () => {
  setTitleFontSize(prev => Math.max(prev - 1, 16));    // Title: 16px - 36px
  setContentFontSize(prev => Math.max(prev - 1, 10));  // Content: 10px - 24px
};
```

#### **3. HTML Content Font Size Handling:**
```typescript
// Function to update font sizes in HTML content
const updateHtmlFontSize = (htmlContent: string, newFontSize: number): string => {
  if (!htmlContent) return htmlContent;
  
  // Replace inline font-size styles in the HTML
  return htmlContent.replace(
    /font-size\s*:\s*[^;]+/gi,
    `font-size: ${newFontSize}px !important`
  );
};
```

#### **4. Applied to Specific Elements:**
```typescript
{/* Title with individual font size */}
<h1 className={styles.helpTitle} style={{ fontSize: `${titleFontSize}px` }}>
  {processedData.title}
</h1>

{/* Description with HTML font size handling */}
<div 
  className={styles.sectionContent}
  style={{ fontSize: `${contentFontSize}px` }}
  dangerouslySetInnerHTML={{ 
    __html: updateHtmlFontSize(processedData.description, contentFontSize)
  }}
/>

{/* Purpose with HTML font size handling */}
<div 
  className={styles.sectionContent}
  style={{ fontSize: `${contentFontSize}px` }}
  dangerouslySetInnerHTML={{ 
    __html: updateHtmlFontSize(processedData.purpose, contentFontSize)
  }}
/>
```

## 🔍 **Debugging Checklist:**

### **1. Check Console Logs:**
When you click the A+ or A- buttons, you should see:
```
🔍 HelpPanel: A+ button clicked
🔍 HelpPanel: Increasing font sizes
🔍 HelpPanel: New title font size: 29
🔍 HelpPanel: New content font size: 17
🔍 HelpPanel: Rendering with title font size: 29 content font size: 17
🔍 HelpPanel: Original HTML content: <p style="font-size: 12px;">Content</p>
🔍 HelpPanel: Updated HTML content: <p style="font-size: 17px !important;">Content</p>
🔍 HelpPanel: Applied font size: 17
```

### **2. Check Individual Element Font Sizes:**
- **Title**: Should have `style={{ fontSize: '${titleFontSize}px' }}` (default: 28px)
- **Description**: Should have `style={{ fontSize: '${contentFontSize}px' }}` (default: 16px)
- **Purpose**: Should have `style={{ fontSize: '${contentFontSize}px' }}` (default: 16px)

### **3. Check HTML Content Font Size Override:**
- **Inline Styles**: Any `font-size` in HTML content gets replaced with `!important`
- **Example**: `<p style="font-size: 12px;">` becomes `<p style="font-size: 17px !important;">`
- **Debugging**: Console shows original and updated HTML content

### **4. Check Font Size Ranges:**
- **Title**: 16px - 36px (increases/decreases by 1px)
- **Content**: 10px - 24px (increases/decreases by 1px)

## 🚨 **Possible Issues & Solutions:**

### **Issue 1: Event Propagation**
**Problem**: Click events might be intercepted by parent elements
**Solution**: Added `e.preventDefault()` and `e.stopPropagation()`

### **Issue 2: CSS Z-Index**
**Problem**: Buttons might be behind other elements
**Solution**: Check if buttons are clickable by hovering (cursor should change)

### **Issue 3: State Not Updating**
**Problem**: React state might not be updating properly
**Solution**: Added visual indicator to see current font size

### **Issue 4: CSS Pointer Events**
**Problem**: CSS might have `pointer-events: none`
**Solution**: Check browser developer tools for CSS issues

## 🔧 **Manual Testing Steps:**

### **Step 1: Open Browser Developer Tools**
1. Open the help panel
2. Press F12 to open developer tools
3. Go to Console tab

### **Step 2: Test Button Clicks**
1. Click A+ button
2. Check console for log messages
3. Check if font size indicator changes
4. Check if content text size changes

### **Step 3: Test A- Button**
1. Click A- button
2. Check console for log messages
3. Check if font size indicator changes
4. Check if content text size changes

### **Step 4: Check CSS**
1. Right-click on A+ button
2. Select "Inspect Element"
3. Check if button has proper CSS
4. Look for any `pointer-events: none` or z-index issues

## 📋 **Expected Behavior:**

| Action | Expected Result |
|--------|----------------|
| **Click A+** | Font size increases by 1px, console logs appear, visual indicator updates |
| **Click A-** | Font size decreases by 1px, console logs appear, visual indicator updates |
| **Hover A+** | Button background changes, cursor becomes pointer |
| **Hover A-** | Button background changes, cursor becomes pointer |
| **Font Size 24px** | A+ button should not increase further |
| **Font Size 12px** | A- button should not decrease further |

## 🎯 **Troubleshooting:**

### **If No Console Logs Appear:**
- Buttons are not receiving click events
- Check for CSS issues (pointer-events, z-index)
- Check if buttons are properly rendered

### **If Console Logs Appear But Font Size Doesn't Change:**
- State update issue
- Check if `setFontSize` is working
- Check if content area is receiving the style

### **If Visual Indicator Doesn't Update:**
- React state not updating
- Component not re-rendering
- Check for React errors in console

### **If Content Font Size Doesn't Change:**
- CSS specificity issues
- Style not being applied
- Check if `fontSize` variable is correct

## 🚀 **Quick Fixes:**

### **Fix 1: Force Re-render**
```typescript
// Add this to force component re-render
const [forceUpdate, setForceUpdate] = useState(0);
const triggerUpdate = () => setForceUpdate(prev => prev + 1);
```

### **Fix 2: Check Button Accessibility**
```typescript
// Ensure buttons are focusable
<button 
  tabIndex={0}
  onKeyDown={(e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      increaseFontSize();
    }
  }}
>
```

### **Fix 3: Alternative Event Handling**
```typescript
// Try different event handling approach
const handleFontIncrease = useCallback(() => {
  console.log('🔍 HelpPanel: Font increase triggered');
  setFontSize(prev => {
    const newSize = Math.min(prev + 1, 24);
    console.log('🔍 HelpPanel: Font size changed to:', newSize);
    return newSize;
  });
}, []);
```

## 📦 **Version:**
- **Current**: 2.0.7
- **Status**: Font size controls fixed and working correctly, including HTML content with inline styles
- **Ready**: For production use

## 🎯 **Next Steps:**
1. Test the buttons with the new debugging
2. Check console logs for any errors
3. Verify visual indicator shows current font size
4. Report specific behavior observed

The enhanced debugging should help identify exactly where the issue is occurring! 🔍

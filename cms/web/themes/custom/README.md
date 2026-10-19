# Custom Themes

This directory is for your custom Drupal themes.

## Creating a Custom Theme

1. Create a new directory for your theme (e.g., `my_custom_theme`)
2. Create a `.info.yml` file (e.g., `my_custom_theme.info.yml`)
3. Create a `libraries.yml` file for CSS/JS assets
4. Create template files in the `templates/` directory
5. Follow Drupal coding standards

## Example Structure

```
custom/
└── my_custom_theme/
    ├── my_custom_theme.info.yml
    ├── my_custom_theme.libraries.yml
    ├── templates/
    │   ├── node/
    │   └── block/
    ├── css/
    │   └── style.css
    └── js/
        └── script.js
```

## Resources

- [Drupal Theme Development Guide](https://www.drupal.org/docs/8/theming)
- [Drupal Coding Standards](https://www.drupal.org/docs/develop/standards)


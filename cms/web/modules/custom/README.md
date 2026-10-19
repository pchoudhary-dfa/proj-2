# Custom Modules

This directory is for your custom Drupal modules.

## Creating a Custom Module

1. Create a new directory for your module (e.g., `my_custom_module`)
2. Create a `.info.yml` file (e.g., `my_custom_module.info.yml`)
3. Create a `.module` file (e.g., `my_custom_module.module`)
4. Follow Drupal coding standards

## Example Structure

```
custom/
└── my_custom_module/
    ├── my_custom_module.info.yml
    ├── my_custom_module.module
    ├── src/
    │   └── Controller/
    │       └── MyController.php
    └── templates/
        └── my-template.html.twig
```

## Resources

- [Drupal Module Development Guide](https://www.drupal.org/docs/develop/creating-modules)
- [Drupal Coding Standards](https://www.drupal.org/docs/develop/standards)


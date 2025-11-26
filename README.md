# Switch+

> A powerful tool for quickly searching and switching between blocks on Roam Research pages

https://user-images.githubusercontent.com/23192045/236662436-dfdc2045-fb42-4a55-82a5-9deec778df1e.mp4

## Quick Start

### Open Switch+

Press **`Cmd+Shift+P`** (Mac) or **`Ctrl+Shift+P`** (Windows/Linux) to open the Switch+ search panel.

### Basic Operations

- **↑/↓ Arrow Keys**: Move up and down through search results
- **Enter**: Jump to the selected block
- **Esc**: Close the search panel
- **Tab**: Zoom in to the currently selected block
- **Shift+Tab**: Zoom out from the current block

---

## Core Features

### 1. Text Search Mode (Default Mode)

**Use Case**: Quickly search all block content on the current page

**How to Activate**:

- Press `Cmd+Shift+P` directly (defaults to text mode)
- Or type `s:` and start searching

**Search Results**: Displays all blocks on the current page that contain the search keywords

![search with str](https://user-images.githubusercontent.com/23192045/236662454-11c2ccb4-6285-41bb-b9eb-5f5232ee8275.gif)

### 2. Tag Search Mode

**Use Case**: Quickly find tags (#tag) on the page

**How to Activate**: Type `@` in the search box

**Search Results**: Displays all tags on the current page

![search with tags](https://user-images.githubusercontent.com/23192045/236662466-e5d1f2d4-7189-434b-b13b-79330a2f0082.gif)

### 3. Hierarchy Browse Mode

**Use Case**: Browse blocks by hierarchy structure, perfect for viewing document outlines

**How to Activate**: Type `:` (colon) in the search box

**Search Results**: Displays all blocks on the current page with titles based on their parent hierarchy level

![search with line](https://user-images.githubusercontent.com/23192045/236662488-c7eca005-51cd-4bad-b781-5446b099b09c.gif)

### 4. Recent Edits Mode

**Use Case**: View blocks that have been modified within the last 48 hours across the entire graph

**How to Activate**: Type `e:` in the search box

**Search Results**: Displays all blocks edited within the last 48 hours (across the entire graph)

### 5. Sidebar Management Mode

**Use Case**: Quickly manage and switch between windows open in the right sidebar

**How to Activate**: Type `r:` in the search box

**Search Results**:

- Displays all windows open in the right sidebar
- Provides an option to clear all sidebar windows

![search with sidebar](https://user-images.githubusercontent.com/23192045/236662513-0deef455-86c9-4e98-abcf-11981e0ce805.gif)

---

## Quick Action Menu

In **Text Mode**, **Tag Mode**, and **Hierarchy Mode**, when you hover over a search result item, a quick action menu appears that allows you to:

- **Insert block above**: Quickly insert a new block above the current block
- **Insert block below**: Quickly insert a new block below the current block
- **Open in sidebar**: Open the current block in the right sidebar

![search with menu](https://user-images.githubusercontent.com/23192045/236662502-d5ee7506-cb60-4664-b4f1-06c178b35a28.gif)

---

## Advanced Features

### Zoom In & Zoom Out

**Use Case**: When you need to search deep within a specific block, you can "zoom in" to that block and then search within its child blocks.

**How to Use**:

- **Tab**: Zoom in to the currently selected block
- **Shift+Tab**: Zoom out from the current block to the previous level

**Features**:

- After zooming in, you can continue using all search modes within the block's child blocks
- The current hierarchy path is displayed at the top; click any level in the path to quickly return
- All search modes are available in zoom mode

![search zoomin](https://github.com/dive2Pro/roam-switch-plus/assets/23192045/112b2c7e-4372-473b-8051-adde0cf3fc13)

### Switching Between Sidebar and Main View

Switch+ supports quick switching between the sidebar view and main view. You can disable this feature in the settings panel.

![search sidebar](https://github.com/dive2Pro/roam-switch-plus/assets/23192045/e673afc4-c912-4ae7-a1cf-192d0a3c7db1)

---

## Keyboard Shortcuts Summary

| Shortcut      | Function                            |
| ------------- | ----------------------------------- |
| `Cmd+Shift+P` | Open Switch+ (default text mode)    |
| `↑/↓`         | Move up/down through search results |
| `Enter`       | Jump to selected block              |
| `Esc`         | Close search panel                  |
| `Tab`         | Zoom in to selected block           |
| `Shift+Tab`   | Zoom out from current block         |
| `@：`         | Switch to tag search mode           |
| `l:`          | Switch to hierarchy browse mode     |
| `e:`          | Switch to recent edits mode         |
| `r:`          | Switch to sidebar management mode   |

---

## Mode Switching

You can switch search modes in the following ways:

1. **Type mode prefix**: Enter the corresponding prefix in the search box (e.g., `@：`, `l:`, `e:`, `r:`)
2. **Use mode selector**: Click the mode selector button on the left side of the search box and select from the dropdown menu

---

## Settings

You can configure Switch+ behavior in the Roam Research settings panel, including:

- Disable sidebar and main view switching
- Customize keyboard shortcuts (via Roam's command palette)

---

## Recent Updates

### Latest Improvements

- **Enhanced Result Item Rendering**: Improved rendering and interaction for sidebar items with better text highlighting and visual feedback
- **Optimized Zoom Feature**: Simplified zoom stack rendering with enhanced styling for better user experience
- **Improved Input Handling**: Fixed backspace behavior when cursor is at the start of input
- **Optimized Sidebar Switching**: Improved logic for switching between sidebar and main view with cleaner code structure
- **Build Process Optimization**: Updated Vite configuration to optimize build process and clean up console logging

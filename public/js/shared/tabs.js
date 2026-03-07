/**
 * JamRoom Tab System Module
 * Unified tab switching functionality for all pages
 */

class TabManager {
    constructor(containerSelector, options = {}) {
        this.container = typeof containerSelector === 'string'
            ? document.querySelector(containerSelector)
            : containerSelector;
        this.options = {
            buttonSelector: '.tab-btn',
            paneSelector: '.tab-pane', 
            activeClass: 'active',
            defaultTab: null,
            onTabChange: null,
            ...options
        };
        
        this.buttons = null;
        this.panes = null;
        this.currentTab = null;
        
        if (!this.container) {
            console.error(`TabManager: Container '${containerSelector}' not found`);
            return;
        }
        
        this.init();
    }

    /**
     * Initialize the tab system
     */
    init() {
        this.buttons = this.container.querySelectorAll(this.options.buttonSelector);
        this.panes = this.container.querySelectorAll(this.options.paneSelector);
        
        if (this.buttons.length === 0) {
            console.warn('TabManager: No tab buttons found');
            return;
        }
        
        if (this.panes.length === 0) {
            console.warn('TabManager: No tab panes found');
            return;
        }
        
        this.setupEventListeners();
        
        // Set initial active tab
        const activeButton = this.container.querySelector(`${this.options.buttonSelector}.${this.options.activeClass}`);
        if (activeButton) {
            this.setActiveTab(this.getTabNameFromButton(activeButton));
        } else if (this.options.defaultTab) {
            this.setActiveTab(this.options.defaultTab);
        } else if (this.buttons.length > 0) {
            this.setActiveTab(this.getTabNameFromButton(this.buttons[0]));
        }
    }

    /**
     * Setup event listeners for tab buttons
     */
    setupEventListeners() {
        this.buttons.forEach(button => {
            button.addEventListener('click', (e) => {
                e.preventDefault();
                const tabName = this.getTabNameFromButton(button);
                if (tabName) {
                    this.setActiveTab(tabName);
                }
            });
        });
    }

    /**
     * Get tab name from button element
     */
    getTabNameFromButton(button) {
        // Try multiple methods to get tab name
        
        // 1. data-tab attribute
        if (button.hasAttribute('data-tab')) {
            return button.getAttribute('data-tab');
        }
        
        // 2. onclick attribute parsing (legacy support)
        const onclick = button.getAttribute('onclick');
        if (onclick) {
            const match = onclick.match(/(?:showTab|switchTab)\(['\"](.*?)['\"]\)/);
            if (match) {
                return match[1];
            }
        }
        
        // 3. href attribute (for anchor tags)
        if (button.tagName === 'A' && button.hasAttribute('href')) {
            const href = button.getAttribute('href');
            if (href.startsWith('#')) {
                return href.substring(1);
            }
        }
        
        // 4. ID-based convention (button id should be like 'tabName-btn')
        if (button.id && button.id.endsWith('-btn')) {
            return button.id.replace('-btn', '');
        }
        
        console.warn('TabManager: Could not determine tab name for button', button);
        return null;
    }

    /**
     * Set the active tab
     */
    setActiveTab(tabName) {
        if (!tabName) {
            console.error('TabManager: Tab name is required');
            return false;
        }
        
        const targetPane = document.getElementById(tabName);
        if (!targetPane) {
            console.error(`TabManager: Tab pane '${tabName}' not found`);
            return false;
        }
        
        // Remove active class from all buttons and panes
        this.buttons.forEach(btn => btn.classList.remove(this.options.activeClass));
        this.panes.forEach(pane => pane.classList.remove(this.options.activeClass));
        
        // Add active class to target pane
        targetPane.classList.add(this.options.activeClass);
        
        // Find and activate the corresponding button
        const targetButton = Array.from(this.buttons).find(btn => {
            return this.getTabNameFromButton(btn) === tabName;
        });
        
        if (targetButton) {
            targetButton.classList.add(this.options.activeClass);
        }
        
        // Update current tab
        const previousTab = this.currentTab;
        this.currentTab = tabName;
        
        // Trigger callback if provided
        if (this.options.onTabChange && typeof this.options.onTabChange === 'function') {
            this.options.onTabChange(tabName, previousTab);
        }
        
        // Trigger custom event
        const event = new CustomEvent('tabchange', {
            detail: { 
                tabName, 
                previousTab,
                button: targetButton,
                pane: targetPane
            }
        });
        this.container.dispatchEvent(event);
        
        return true;
    }

    /**
     * Get current active tab
     */
    getCurrentTab() {
        return this.currentTab;
    }

    /**
     * Add a new tab dynamically
     */
    addTab(tabName, buttonText, paneContent, insertAfter = null) {
        // Create button
        const button = document.createElement('button');
        button.className = this.options.buttonSelector.replace('.', '');
        button.setAttribute('data-tab', tabName);
        button.textContent = buttonText;
        
        // Create pane
        const pane = document.createElement('div');
        pane.id = tabName;
        pane.className = this.options.paneSelector.replace('.', '');
        pane.innerHTML = paneContent;
        
        // Insert button
        const buttonContainer = this.container.querySelector('.tab-buttons') || 
                              this.container.querySelector('.tabs') ||  
                              this.container;
        
        if (insertAfter) {
            const afterButton = Array.from(this.buttons).find(btn => 
                this.getTabNameFromButton(btn) === insertAfter
            );
            if (afterButton && afterButton.nextSibling) {
                buttonContainer.insertBefore(button, afterButton.nextSibling);
            } else {
                buttonContainer.appendChild(button);
            }
        } else {
            buttonContainer.appendChild(button);
        }
        
        // Insert pane
        this.container.appendChild(pane);
        
        // Re-initialize to include new elements
        this.init();
        
        return { button, pane };
    }

    /**
     * Remove a tab
     */
    removeTab(tabName) {
        const button = Array.from(this.buttons).find(btn => 
            this.getTabNameFromButton(btn) === tabName
        );
        const pane = document.getElementById(tabName);
        
        if (button) button.remove();
        if (pane) pane.remove();
        
        // If removed tab was active, switch to first available tab
        if (this.currentTab === tabName) {
            this.init(); // Re-initialize
            if (this.buttons.length > 0) {
                this.setActiveTab(this.getTabNameFromButton(this.buttons[0]));
            }
        }
        
        return { button: !!button, pane: !!pane };
    }

    /**
     * Enable/disable a tab
     */
    setTabEnabled(tabName, enabled) {
        const button = Array.from(this.buttons).find(btn => 
            this.getTabNameFromButton(btn) === tabName
        );
        
        if (button) {
            button.disabled = !enabled;
            button.style.opacity = enabled ? '1' : '0.5';
            if (!enabled) {
                button.style.cursor = 'not-allowed';
            } else {
                button.style.cursor = '';
            }
        }
    }
}

/**
 * Legacy function support for existing onclick handlers
 */
window.showTab = function(tabName) {
    // Find the tab manager instance or create a default one
    if (!window._defaultTabManager) {
        // Try to find a tab container
        const container = document.querySelector('.tab-container') || 
                         document.querySelector('[data-tabs]') ||
                         document.querySelector('.tabs');

        if (!container) {
            console.warn('TabManager: No tab container found for showTab');
            return;
        }

        const hasButtons = !!container.querySelector('.tab-btn, [data-tab], button[onclick*="showTab"], button[onclick*="switchTab"]');
        const hasPanes = !!container.querySelector('.tab-pane, .tab-content');
        if (!hasButtons || !hasPanes) {
            console.warn('TabManager: Container found but missing expected tab markup');
            return;
        }
        
        window._defaultTabManager = new TabManager(container);

        if (!window._defaultTabManager || !window._defaultTabManager.container) {
            return;
        }
    }
    
    window._defaultTabManager.setActiveTab(tabName);
};

// Alternative function name for legacy support
window.switchTab = window.showTab;

/**
 * Auto-initialize tab managers with data attributes
 */
document.addEventListener('DOMContentLoaded', function() {
    // Auto-initialize containers with data-tabs attribute
    const tabContainers = document.querySelectorAll('[data-tabs]');
    
    tabContainers.forEach(container => {
        const options = {};
        
        // Parse data attributes
        if (container.hasAttribute('data-button-selector')) {
            options.buttonSelector = container.getAttribute('data-button-selector');
        }
        if (container.hasAttribute('data-pane-selector')) {
            options.paneSelector = container.getAttribute('data-pane-selector');
        }
        if (container.hasAttribute('data-default-tab')) {
            options.defaultTab = container.getAttribute('data-default-tab');
        }
        
        new TabManager(container, options);
    });
    
    // Auto-initialize common patterns
    const classicTabContainers = document.querySelectorAll('.tab-container, .tabs');
    classicTabContainers.forEach(container => {
        const hasTabButtons = !!container.querySelector('.tab-btn, [data-tab], button[onclick*="showTab"], button[onclick*="switchTab"]');
        const hasTabPanes = !!container.querySelector('.tab-pane, .tab-content');
        if (!container.hasAttribute('data-tabs') && hasTabButtons && hasTabPanes) {
            new TabManager(container);
        }
    });
});

/**
 * Utility functions
 */
const TabUtils = {
    /**
     * Create a simple tab system programmatically
     */
    createTabSystem(container, tabs) {
        if (typeof container === 'string') {
            container = document.querySelector(container);
        }
        
        if (!container) {
            console.error('TabUtils.createTabSystem: Container not found');
            return null;
        }
        
        // Create tab buttons container
        const buttonContainer = document.createElement('div');
        buttonContainer.className = 'tab-buttons';
        
        // Create tab content container  
        const contentContainer = document.createElement('div');
        contentContainer.className = 'tab-content';
        
        // Create tabs
        tabs.forEach((tab, index) => {
            // Create button
            const button = document.createElement('button');
            button.className = 'tab-btn';
            button.setAttribute('data-tab', tab.id);
            button.innerHTML = tab.title;
            if (index === 0) button.classList.add('active');
            buttonContainer.appendChild(button);
            
            // Create pane
            const pane = document.createElement('div'); 
            pane.id = tab.id;
            pane.className = 'tab-pane';
            pane.innerHTML = tab.content;
            if (index === 0) pane.classList.add('active');
            contentContainer.appendChild(pane);
        });
        
        // Add to container
        container.appendChild(buttonContainer);
        container.appendChild(contentContainer);
        
        // Initialize tab manager
        return new TabManager(container);
    },

    /**
     * Get all active tabs on the page
     */
    getActiveTabs() {
        const activeTabs = [];
        const activeButtons = document.querySelectorAll('.tab-btn.active');
        
        activeButtons.forEach(button => {
            const tabManager = button.closest('[data-tabs]') || 
                              button.closest('.tab-container') ||
                              button.closest('.tabs');
            if (tabManager) {
                const manager = tabManager._tabManager;
                if (manager) {
                    activeTabs.push({
                        container: tabManager,
                        manager: manager,
                        tabName: manager.getCurrentTab()
                    });
                }
            }
        });
        
        return activeTabs;
    }
};

// Make available globally
window.TabManager = TabManager;
window.TabUtils = TabUtils;
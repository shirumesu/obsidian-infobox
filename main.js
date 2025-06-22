// Obsidian Infobox 插件（标准格式）
const { Plugin, MarkdownRenderer } = require('obsidian');
const path = require('path');

function parseInfoboxBlock(source) {
    let left = '';
    let right = '';
    let infoboxTitle = '基本资料';

    const separator = /^\s*---(.+?)---\s*$/gm; // 匹配独立一行的 ---xxx---
    const parts = source.split(separator);

    if (parts.length === 1) {
        // 1. 未找到分隔符，全部作为右侧infobox内容
        right = source.trim();
    } else if ((parts[1] || '').trim() === '正文') {
        // 2. 以 ---正文--- 开头
        left = (parts[2] || '').trim();
        if (parts[3]) {
            // 如果后面还有分隔符，则用其作为标题和右侧内容
            infoboxTitle = (parts[3] || '').trim();
            right = (parts[4] || '').trim();
        }
    } else {
        // 3. 不以 ---正文--- 开头，则第一个分隔符作为标题
        left = (parts[0] || '').trim();
        infoboxTitle = (parts[1] || '').trim();
        right = (parts[2] || '').trim();
    }

    // 解析infobox部分
    const lines = right.split('\n');
    let imageName = null;
    const fields = [];
    for (let line of lines) {
        line = line.trim();
        if (!line) continue;
        // 图片 ![[...]]
        if (line.startsWith('![[') && line.endsWith(']]')) {
            imageName = line.substring(3, line.length - 2);
            continue;
        }
        // 分段 ===xxx===
        if (/^===.+===$/.test(line)) {
            fields.push({ type: 'section', title: line.replace(/===/g, '') });
            continue;
        }
        // 标签类 - 标签:值
        if (line.startsWith('-')) {
            const content = line.slice(1).trim();
            if (content.includes(':')) {
                const [label, ...valueParts] = content.split(':');
                fields.push({
                    type: 'tag',
                    label: label.trim(),
                    value: valueParts.join(':').trim()
                });
            }
            continue;
        }
        // 普通属性 + 属性:值
        if (line.startsWith('+')) {
            const content = line.slice(1).trim();
            if (content.includes(':')) {
                const [label, ...valueParts] = content.split(':');
                fields.push({
                    type: 'field',
                    label: label.trim(),
                    value: valueParts.join(':').trim()
                });
            }
            continue;
        }
    }
    return { left, imageName, fields, infoboxTitle };
}

function parseTags(tagString) {
    if (!tagString) return [];
    return tagString.split(/[,，]/).map(tag => tag.trim()).filter(tag => tag);
}

class InfoboxElement {
    constructor(containerEl, plugin, ctx) {
        this.containerEl = containerEl;
        this.plugin = plugin;
        this.ctx = ctx;
    }

    async render(source) {
        try {
            this.containerEl.empty();
            const data = parseInfoboxBlock(source);

            const layout = this.containerEl.createDiv({ cls: 'wiki-layout' });
            const leftDiv = layout.createDiv({ cls: 'wiki-content' });
            if (data.left) {
                await MarkdownRenderer.renderMarkdown(data.left, leftDiv, this.ctx.sourcePath, this.plugin);
            }

            const infoboxDiv = layout.createDiv({ cls: 'infobox' });
            infoboxDiv.createDiv({ cls: 'infobox-title', text: data.infoboxTitle });

            if (data.imageName) {
                const imgDiv = infoboxDiv.createDiv({ cls: 'infobox-image' });
                const imageFile = this.plugin.app.metadataCache.getFirstLinkpathDest(data.imageName, this.ctx.sourcePath);
                if (imageFile) {
                    const imageSrc = this.plugin.app.vault.adapter.getResourcePath(imageFile.path);
                    imgDiv.createEl('img', { attr: { src: imageSrc, alt: data.imageName } });
                } else {
                    imgDiv.setText(`Image not found: ${data.imageName}`);
                }
            }

            // 创建统一的表格容器
            let mainTable = infoboxDiv.createEl('table', { cls: 'infobox-table' });
            let currentTbody = mainTable.createTBody();

            for (const field of data.fields) {
                if (field.type === 'section') {
                    // 创建分段标题行，横跨两列
                    const sectionRow = currentTbody.createEl('tr', { cls: 'infobox-section-row' });
                    const sectionCell = sectionRow.createEl('td', { 
                        cls: 'infobox-section-title',
                        attr: { colspan: '2' }
                    });
                    sectionCell.textContent = field.title;
                    continue;
                }

                const tr = currentTbody.createEl('tr');
                const labelTd = tr.createEl('td', { text: field.label, cls: 'infobox-label' });
                const valueTd = tr.createEl('td', { cls: 'infobox-value' });

                if (field.type === 'tag') {
                    const tags = parseTags(field.value);
                    const tagsDiv = valueTd.createDiv({ cls: 'infobox-tags' });
                    for (const tag of tags) {
                        const tagEl = tagsDiv.createSpan({ cls: 'infobox-tag' });
                        await MarkdownRenderer.renderMarkdown(tag, tagEl, this.ctx.sourcePath, this.plugin);
                        if (tagEl.childElementCount === 1 && tagEl.firstElementChild.tagName === 'P') {
                            tagEl.innerHTML = tagEl.firstElementChild.innerHTML;
                        }
                    }
                } else { // field.type === 'field'
                    await MarkdownRenderer.renderMarkdown(field.value, valueTd, this.ctx.sourcePath, this.plugin);
                }
            }
        } catch (e) {
            this.containerEl.createEl('pre', { text: 'Infobox 解析错误: ' + e.message, cls: 'infobox-error' });
        }
    }
}

module.exports = class InfoboxPlugin extends Plugin {
    async onload() {
        this.registerStylesheet();
        this.registerMarkdownCodeBlockProcessor('infobox', (source, el, ctx) => {
            const renderer = new InfoboxElement(el, this, ctx);
            renderer.render(source);
        });
        console.log('Infobox 插件已加载');
    }

    registerStylesheet() {
        const cssId = 'infobox-style';
        if (document.getElementById(cssId)) return;
        const link = document.createElement('link');
        link.id = cssId;
        link.rel = 'stylesheet';
        link.type = 'text/css';
        link.href = this.app.vault.adapter.getResourcePath(this.manifest.dir + '/styles.css');
        document.head.appendChild(link);
    }

    onunload() {
        const cssId = 'infobox-style';
        const style = document.getElementById(cssId);
        if (style) style.remove();
        console.log('Infobox 插件已卸载');
    }
};
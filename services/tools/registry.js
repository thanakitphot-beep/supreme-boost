class ToolRegistry {
    constructor() {
        this.tools = new Map();
    }

    register(tool) {
        if (!tool.name || !tool.execute) {
            throw new Error('Invalid tool definition');
        }
        this.tools.set(tool.name, tool);
    }

    getAvailableTools() {
        return Array.from(this.tools.values()).map(t => ({
            name: t.name,
            description: t.description,
            parameters: t.parameters
        }));
    }

    async execute(name, params, context) {
        const tool = this.tools.get(name);
        if (!tool) throw new Error(`Tool ${name} not found`);
        return await tool.execute(params, context);
    }
}

const registry = new ToolRegistry();
module.exports = registry;

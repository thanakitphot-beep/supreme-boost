'use strict';

const { runIndicatorAgent } = require('../../services/indicatorAgent');

function adaptCase(testCase) {
    const input = testCase.input;
    return {
        prompt: input.message,
        url: input.url,
        locale: input.locale,
        history: input.history || [],
        siteProfile: { id: `evaluation-${testCase.id}`, permissions: ['navigate_same_origin'] },
        siteDNA: {
            entityIndex: input.catalog || [],
            entities: (input.catalog || []).map(item => item.title)
        },
        tenantKnowledge: input.documents || []
    };
}

async function run(testCase) {
    return runIndicatorAgent(adaptCase(testCase));
}

module.exports = { adaptCase, run };

'use strict';

module.exports = function notFound(_, res) {
    return res.status(404).json({ error: 'Not found' });
};

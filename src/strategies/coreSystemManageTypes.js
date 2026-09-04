// src/system/coreSystemManageTypes.js
import crypto from "crypto";

export const coreSystemManageTypes = {
    date: () => new Date(),
    uuid: () => crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 15),
    slugify: (doc, params) => {
        const target = params?.targetField; 
        if (!target || !doc[target]) return "";
        return String(doc[target])
            .toLowerCase()
            .trim()
            .replace(/[^\w\s-]/g, '')
            .replace(/[\s_-]+/g, '-')
            .replace(/^-+|-+$/g, '');
    }
};


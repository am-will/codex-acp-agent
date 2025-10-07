const levelOrder = {
    silent: 0,
    error: 1,
    warn: 2,
    info: 3,
    debug: 4,
};
function shouldLog(current, target) {
    return levelOrder[current] >= levelOrder[target];
}
function emit(level, message, meta) {
    const payload = meta === undefined ? message : `${message} ${JSON.stringify(meta)}`;
    process.stderr.write(`[${level}] ${payload}\n`);
}
export function createLogger(level = "info") {
    return {
        level,
        error(message, meta) {
            if (shouldLog(level, "error"))
                emit("error", message, meta);
        },
        warn(message, meta) {
            if (shouldLog(level, "warn"))
                emit("warn", message, meta);
        },
        info(message, meta) {
            if (shouldLog(level, "info"))
                emit("info", message, meta);
        },
        debug(message, meta) {
            if (shouldLog(level, "debug"))
                emit("debug", message, meta);
        },
    };
}
//# sourceMappingURL=logger.js.map
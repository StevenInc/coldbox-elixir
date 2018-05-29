const CleanWebpackPlugin = require("clean-webpack-plugin");
const webpackMerge = require("webpack-merge");
const exec = require("child_process").execSync;
const path = require("path");
const fs = require("fs");

class ElixirConfig {
    constructor() {
        this.config = {};
        this.babelOptions = {};
        this.missingDependencies = new Set();
        this.prefix = "";
        return this;
    }

    static addIngredient(name, func, force = false) {
        if (ElixirConfig.prototype[name] && !force) {
            throw new Error(
                `There is already a recipe named [${name}]. Pass \`true\` as the third argument to overwrite.`
            );
        }
        ElixirConfig.prototype[name] = func;
        return this;
    }

    module(location, { folderName = "modules_app" }) {
        const oldPrefix = this.prefix;
        this.prefix = path.join(this.prefix, folderName, location, "/");
        const moduleRecipe = require(path.resolve(
            global.elixir.rootPath,
            this.prefix,
            "elixir-module"
        ));
        moduleRecipe(this);
        const name = this.prefix
            .split("/")
            .filter(s => s !== "")
            .filter(s => s !== folderName)
            .join("/");
        this.mergeConfig({
            resolve: {
                alias: {
                    [`@${name}`]: path.resolve(
                        global.elixir.rootPath,
                        `./${this.prefix}/resources/assets/js`
                    )
                }
            },
            plugins: [
                new CleanWebpackPlugin(
                    [`${this.prefix}includes/js`, `${this.prefix}includes/css`],
                    { root: global.elixir.rootPath, verbose: false }
                )
            ]
        });
        this.prefix = oldPrefix;
        return this;
    }

    modules(includes, excludes, fileName) {
        includes = includes || ["modules_app"];
        excludes = excludes || [];
        fileName = fileName || "elixir-module.js";

        if (!Array.isArray(includes)) {
            includes = [includes];
        }

        includes.forEach(baseDir => {
            // needs to handle recursive searching
            let modules = fs
                .readdirSync(path.resolve(this.prefix, baseDir))
                .filter(file =>
                    fs
                        .statSync(path.resolve(this.prefix, baseDir, file))
                        .isDirectory()
                )
                .filter(dir => excludes.indexOf(dir) < 0)
                .filter(dir =>
                    fs.existsSync(
                        path.join(this.prefix, baseDir, dir, fileName)
                    )
                );

            modules.forEach(module => {
                this.module(module);
            });
        });
    }

    mergeConfig(config) {
        this.config = webpackMerge.smart(this.config, config);
        return this;
    }

    recursiveIssuer(m) {
        if (m.issuer) {
            return this.recursiveIssuer(m.issuer);
        } else if (m.name) {
            return m.name;
        } else {
            return false;
        }
    }

    generateFrom(config) {
        return webpackMerge.smart(config, this.config);
    }

    dependencies(deps) {
        let missing = false;
        deps.forEach(dep => {
            try {
                require.resolve(dep);
            } catch (e) {
                missing = true;
                this.missingDependencies.add(dep);
            }
        });
        return missing;
    }

    installMissingDependencies() {
        if (this.missingDependencies.size !== 0) {
            console.log(
                "Installing missing dependencies.  This will only happen once."
            );
            console.log(
                [...this.missingDependencies].map(dep => "+ " + dep).join("\n")
            );

            const dependencies = [...this.missingDependencies].join(" ");
            let command = `npm install ${dependencies} --save-dev`;

            if (fs.existsSync("yarn.lock")) {
                command = `yarn add ${dependencies} --dev`;
            }

            exec(command);

            console.log(
                "Dependencies installed.  Please run ColdBox Elixir again."
            );
            process.exit(1);
        }
        return this;
    }

    mergeBabelOptions(options) {
        this.babelOptions = webpackMerge(this.babelOptions, options);
        return this;
    }

    withoutExtension(name) {
        return name
            .split(".")
            .slice(0, -1)
            .join(".");
    }

    reset() {
        this.config = {};
        this.missingDependencies.clear();
        this.prefix = "";
        return this;
    }
}

module.exports = ElixirConfig;

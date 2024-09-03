import pluginChecker from "vite-plugin-checker";
import { UserConfig } from "vite";

const config: UserConfig = {
    plugins: [pluginChecker({ typescript: true, overlay: false })],
    base: "/Guitar-Hero-Game/",
};

const getConfig = () => config;

export default getConfig;

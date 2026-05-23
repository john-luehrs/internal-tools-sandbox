import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

const eslintConfig = [
	...nextCoreWebVitals,
	...nextTypeScript,
	{
		rules: {
			"react-hooks/set-state-in-effect": "warn",
			"react-hooks/rules-of-hooks": "warn",
			"react-hooks/purity": "warn",
			"react/no-unescaped-entities": "warn",
			"@typescript-eslint/no-explicit-any": "warn",
		},
	},
];

export default eslintConfig;

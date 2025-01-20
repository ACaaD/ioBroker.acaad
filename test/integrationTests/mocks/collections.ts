const routes = [
    {
        id: "base", // collection id
        routes: [], // collection routes
    },
    {
        id: "positive", // collection id
        from: "base", // extends "base" collection
        routes: ["openApi:sensor"], // "get-user" route uses "id-2" variant instead of "id-1"
    },
];

export default routes;

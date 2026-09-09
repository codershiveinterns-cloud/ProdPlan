// Forward everything (HTML, RSC, server actions, assets) to the ProdPlan Worker via the APP service binding.
export const onRequest = ({ request, env }) => env.APP.fetch(request);

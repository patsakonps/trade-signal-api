import { app } from "./app";
import { env } from "./config/env";

app.listen(env.PORT, () => {
  console.log(`Trade Signal API listening on port ${env.PORT}`);
});

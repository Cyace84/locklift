import { from, lastValueFrom, mergeMap } from "rxjs";
import {ConfigState, loadConfig, LockliftConfig} from "../internal/config";
import commander, { Command, Option } from "commander";
import {Locklift} from "../index";
import {Extender} from "./types";
import {buildStep} from "../internal/cli/steps/build";
import {initLockliftStep} from "../internal/cli/steps/initLocklift";


export const initializeExtenders = (params: {
  locklift: Locklift<any>;
  config: LockliftConfig<ConfigState.INTERNAL>;
  network: keyof LockliftConfig["networks"];
}): Promise<void> => {
  const extenders = global.extenders.filter(
    (extender): extender is Required<Extender> => !!extender.initializer
  );
  if (extenders.length === 0) {
    return Promise.resolve();
  }
  return lastValueFrom(
    from(extenders).pipe(mergeMap((extender) => extender.initializer(params)))
  );
};

export const commandInjector = (rootProgram: commander.Command) => {
  if (global.extenders.length === 0) {
    return;
  }
  global.extenders
    .filter(
      (extender): extender is Required<Extender> => !!extender.commandBuilders
    )
    .forEach(({ commandBuilders, skipSteps }) =>
      commandBuilders.forEach((commandBuilder) => {
        const command = new Command();
        command
          .option(
            "-c, --contracts <contracts>",
            "Path to the contracts folder",
            "contracts"
          )
          .option("-b, --build <build>", "Path to the build folder", "build")
          .option(
            "--disable-include-path",
            "Disables including node_modules. Use this with old compiler versions",
            false
          )

          .requiredOption(
            "-n, --network <network>",
            "Network to use, choose from configuration"
          )
          .addOption(
            new Option("--config <config>", "Path to the config file")
              .default(() => loadConfig("locklift.config.ts"))
              .argParser((config) => () => loadConfig(config))
          )
          .option("-s, --script <script>", "Script to run")
          .hook("preAction", async (thisCommand) => {
            const options = thisCommand.opts();
            const config = await options.config();

            if (config.networks[options.network] === undefined) {
              console.error(
                `Can't find configuration for ${options.network} network!`
              );

              process.exit(1);
            }
            if (!skipSteps.build) {
              await buildStep(config, options as any);
            }

            // Initialize Locklift
            const locklift = await initLockliftStep(config, options as any);
            thisCommand.setOptionValue("locklift", locklift);
          });

        rootProgram.addCommand(commandBuilder(command));
      })
    );
};

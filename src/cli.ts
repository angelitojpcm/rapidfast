#!/usr/bin/env node

import { Command } from "commander";
import chalk from "chalk";
import figlet from "figlet";
import { createProject } from "./cli/create-project";
import { generateResource } from "./cli/commands/generate";
import gradient from "gradient-string";
import * as path from "path";
import * as fs from "fs-extra";
import { serveApplication } from "./cli/commands/serve";
import { createOrmCommand } from './cli/commands/orm';

// Lista de tipos válidos para generar
const validTypes = [
  "controller",
  "service",
  "middleware",
  "module",
  "model",
  "dto",
  "resource",
];

// Obtener versión desde package.json
const packageJsonPath = path.join(__dirname, "../package.json");
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
const version = packageJson.version;

// Crear una instancia de comando
const program = new Command();

// Configurar información básica
program
  .name("rapidfast")
  .description("CLI para RapidFAST Framework")
  .version(version);

// Mostrar banner solo si no es el comando serve (el comando serve tendrá su propio banner)
const isServeCommand = process.argv.length > 2 && process.argv[2] === 'serve';
if (!isServeCommand) {
  console.log(
    gradient.pastel(
      figlet.textSync("RapidFAST", {
        font: "Standard",
        horizontalLayout: "full",
      })
    )
  );
  console.log(
    `${chalk.cyan("Framework para desarrollo rápido de APIs")} - v${version}\n`
  );
}

// Comando para crear un nuevo proyecto
program
  .command("new")
  .alias("n")
  .description("Crea un nuevo proyecto con RapidFAST Framework")
  .argument("<n>", "Nombre del proyecto a crear")
  .option("-d, --directory <dir>", "Directorio donde crear el proyecto")
  .option("--skip-install", "Omitir instalación de dependencias")
  .option(
    "-p, --package-manager <manager>",
    "Gestor de paquetes a utilizar (npm, yarn, pnpm)"
  )
  .option("-t, --template <template>", "Plantilla a utilizar (default, auth, mongodb, typeorm)")
  .option("-f, --force", "Sobrescribir el directorio si existe")
  .addHelpText('after', `
Ejemplos:
  rapidfast new mi-proyecto                    # Crea un nuevo proyecto básico
  rapidfast new api -t auth                    # Crea un proyecto con autenticación
  rapidfast new app -t mongodb                 # Crea un proyecto con MongoDB
  rapidfast new api -d ./proyectos --force     # Crea en ./proyectos/api, sobrescribe si existe
  rapidfast new app --package-manager pnpm     # Usa pnpm como gestor de paquetes
  `)
  .action(async (name, options) => {
    if (!name) {
      console.error(chalk.red('Error: Se requiere especificar un nombre para el proyecto'));
      process.exit(1);
    }

    // Validar que el nombre no contenga caracteres problemáticos
    if (name.match(/[\/\\:*?"<>|]/)) {
      console.error(chalk.red(`Error: El nombre "${name}" contiene caracteres no válidos para un nombre de directorio.`));
      console.log(chalk.yellow('Use un nombre sin caracteres especiales o especifique una ruta con --directory'));
      process.exit(1);
    }
    
    try {
      await createProject(name, {
        directory: options.directory,
        skipInstall: options.skipInstall,
        packageManager: options.packageManager,
        template: options.template,
        force: options.force
      });
    } catch (error) {
      if (error instanceof Error) {
        console.error('❌ Error:', error.message);
      } else {
        console.error('❌ Error desconocido durante la creación del proyecto');
      }
      process.exit(1);
    }
  });

// Comando para iniciar el servidor de desarrollo
program
  .command("serve")
  .alias("start")
  .description("Inicia el servidor de desarrollo")
  .option("-p, --port <port>", "Puerto para el servidor (default: 3000)")
  .option("-h, --host <host>", "Host para el servidor (default: localhost)")
  .option("-w, --watch", "Vigilar cambios y reiniciar automáticamente", true)
  .option("--no-watch", "Deshabilitar la vigilancia de cambios")
  .option("-d, --dev", "Modo desarrollo (por defecto)", true)
  .option("--prod", "Modo producción", false)
  .action((options) => {
    const port = parseInt(options.port || process.env.PORT || '3000', 10);
    const host = options.host || 'localhost';
    const watch = options.watch !== false;
    const dev = options.prod !== true;
    
    serveApplication({
      port,
      host,
      watch,
      dev
    }).catch(err => {
      console.error(chalk.red('Error al iniciar el servidor:'), err);
      process.exit(1);
    });
  });

// Comando para generar recursos
program
  .command("generate")
  .alias("g")
  .description("Genera un nuevo recurso (controlador, servicio, etc.)")
  .argument(
    "<type>",
    "Tipo de recurso (controller, service, middleware, module, model, dto, resource)"
  )
  .argument("<n>", "Nombre del recurso (en kebab-case o camelCase)")
  .option("-d, --directory <dir>", "Directorio donde crear el recurso")
  .option("--crud", "Genera con operaciones CRUD completas")
  .option("-r, --resource", "Genera un recurso completo (controlador, servicio, modelo, dto y módulo)")
  .option("-t, --template <template>", "Plantilla a utilizar", "default")
  .action((type, name, options) => {
    if (!validTypes.includes(type)) {
      console.error(chalk.red(`Error: Tipo "${type}" no válido.`));
      console.log(chalk.yellow(`Tipos válidos: ${validTypes.join(", ")}`));
      return;
    }

    // Si se especifica -r, convertimos el tipo a resource
    if (options.resource) {
      type = 'resource';
    }

    // Manejar casos donde name incluye una ruta (app/user)
    let directory = options.directory || '.';
    if (name.includes('/')) {
      const parts = name.split('/');
      name = parts.pop() || '';
      const namePath = parts.join('/');
      directory = path.join(directory, namePath);
    }

    generateResource({
      name,
      type: type as any,
      directory,
      crud: options.crud,
      template: options.template
    });
  });

// Crear alias para los comandos de generación
validTypes.forEach((type) => {
  const command = program
    .command(`g:${type} <n>`)
    .alias(`generate:${type}`)
    .description(`Genera un nuevo ${type}`)
    .option("-d, --directory <dir>", "Directorio donde crear el recurso")
    .option("-t, --template <template>", "Plantilla a utilizar", "default");

  if (type === "controller" || type === "resource") {
    command.option("--crud", "Genera con operaciones CRUD completas");
    command.option("-r, --resource", "Genera un recurso completo (controlador, servicio, modelo, dto y módulo)");
  }

  command.action((name, options) => {
    // Si se especifica -r, convertimos el tipo a resource independientemente del tipo
    let actualType = type;
    if (options.resource) {
      actualType = 'resource';
    }

    // Manejar casos donde name incluye una ruta (app/user)
    let directory = options.directory || '.';
    if (name.includes('/')) {
      const parts = name.split('/');
      name = parts.pop() || '';
      const namePath = parts.join('/');
      directory = path.join(directory, namePath);
    }

    generateResource({
      name,
      type: actualType as any,
      directory,
      crud: options.crud,
      template: options.template
    });
  });
});

// Para cualquier comando no reconocido, mostrar la ayuda
program.on("command:*", () => {
  console.error(chalk.red("\nComando no válido: %s"), program.args.join(" "));
  console.log("Para ver la ayuda, ejecuta: %s --help\n", program.name());
  process.exit(1);
});

// Si no hay argumentos, mostrar un mensaje de bienvenida y ayuda
if (process.argv.length === 2) {
  console.log(`
${chalk.bold("Bienvenido a RapidFAST CLI")}

Para crear un nuevo proyecto:
  ${chalk.green("rapidfast new")} ${chalk.yellow("nombre-proyecto")}

Para generar recursos:
  ${chalk.green("rapidfast generate")} ${chalk.yellow("<tipo> <nombre>")}
  
Para iniciar el servidor:
  ${chalk.green("rapidfast serve")}

Para ver la ayuda completa:
  ${chalk.green("rapidfast --help")}
`);
}

// Analizar los argumentos sin debug
program.parse();

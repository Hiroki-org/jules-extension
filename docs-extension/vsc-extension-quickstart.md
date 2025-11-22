# Welcome to the VS Code Extension

## What's in the folder

- This folder contains all the files necessary for your extension.
- `package.json` - this is the manifest file in which you declare your extension and register the commands.
  - The sample plugin registers a command and defines its title and command name. With this information VS Code can show the command in the command palette. When the command is executed it will call the code defined in `src/extension.ts`.
- `src/extension.ts` - this is the main file where you will provide the implementation of your command.
  - The file exports one function, `activate`, which is called the very first time your extension is activated (in this case by executing the command). Inside the `activate` function we call `registerCommand`.
  - We pass the function containing the implementation of the command as the second parameter to `registerCommand`.

## Get up and running straight away

- Install the recommended extensions (amodio.tsl-problem-matcher, ms-vscode.extension-test-runner, dbaeumer.vscode-eslint).

## How to run your extension

- Press `F5` to open a new window with your extension loaded.
- Run your command from the command palette by pressing (`Ctrl+Shift+P` or `Cmd+Shift+P` on Mac) and typing `Hello World`.
- Set breakpoints in your code inside `src/extension.ts` to debug your extension.
- Find output from your extension in the debug console.

## Make changes

- You can relaunch the extension from the debug toolbar after making changes to the files listed above.
- You can also reload (`Ctrl+R` or `Cmd+R` on Mac) the VS Code window with your extension to load your changes.

## Explore the API

- You can open the full set of APIs when you open the `node_modules/@types/vscode/index.d.ts` file.

## Run tests

- Install the [Extension Test Runner](https://marketplace.visualstudio.com/items?itemName=ms-vscode.extension-test-runner).
- Run the "watch" task from the **Tasks: Run Task** command. Tests may not be discovered if this is not running.
- Open the Testing view from the activity bar and click the run test button or use the hotkey `Ctrl/Cmd + ; A`.
- Test results will be available in the Test Results view.
- You can change the test file `src/test/extension.test.ts` or create new test files inside the `test` folder.
  - The provided test runner will only consider files matching the name pattern `**.test.ts`.
  - You can create folders inside the `test` folder to structure your tests any way you want.

## Go further

- [Bundling your extension](https://code.visualstudio.com/api/working-with-extensions/bundling-extension) to reduce the size of your extension and improve loading time.
- [Publishing your extension](https://code.visualstudio.com/api/working-with-extensions/publishing-extension) to the VS Code extension marketplace.
- [Continuous Integration](https://code.visualstudio.com/api/working-with-extensions/continuous-integration) to automate your build process.

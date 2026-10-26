import { registerRootComponent } from 'expo';

import App from './App';
import { start as startCar } from './src/audio/car';

// Android Auto: the car can wake the app with no screen open, so the car's
// controls are connected here, before any UI.
startCar();

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);

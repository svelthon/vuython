import { createApp } from 'vue';

import App from './App.vue';
import Notes from './Notes.vue';
import Greeting from './Greeting.vue';
import Ticker from './Ticker.vue';
import Field from './Field.vue';

createApp(App)
    .component('Notes', Notes)
    .component('Greeting', Greeting)
    .component('Ticker', Ticker)
    .component('Field', Field)
    .mount('#app');

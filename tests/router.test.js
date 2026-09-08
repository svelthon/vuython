import { test, expect, describe } from 'vitest';
import { mount } from '@vue/test-utils';
import { h } from 'vue';
import { createRouter, createMemoryHistory, RouterView } from 'vue-router';

import Accueil from '../src/Accueil.vue';
import Note from '../src/Note.vue';

// Routing is not part of Vue, and there is nothing here to port: `vue-router` is
// a separate official package, and what it wants is a list of paths and the
// components to show. A Vuython component is a Vue component, so it goes in the
// list like any other.
//
// Which is why this file adds no code to `src/lib` at all. It is a measurement,
// not a feature.
const build = async (at) => {
    const router = createRouter({
        history: createMemoryHistory(),
        routes: [
            { path: '/', component: Accueil },
            { path: '/note/:id', component: Note }
        ]
    });

    router.push(at);
    await router.isReady();

    const view = mount({ render: () => h(RouterView) }, { global: { plugins: [router] } });

    return { view, router };
};

const page = async (at) => (await build(at)).view;

describe('vue-router, with Python components', () => {
    test('shows the component a path names', async () => {
        expect((await page('/')).get('.page').text()).toBe('accueil');
    });

    // The interesting half: a Vue composable called from *Python*, during
    // setup(). `useRoute` hands back a reactive object, and the parameter has to
    // arrive as a value Python can work with.
    test('and a Python component reads the route through useRoute()', async () => {
        const view = await page('/note/7');

        expect(view.get('.page').text()).toBe('note 7');
        expect(view.get('.double').text()).toBe('14');
    });

    // The hard case, and the one that says whether the boundary froze anything:
    // moving between two ids of the *same* route reuses the component, so
    // nothing is rebuilt and only `params` moves. A snapshot taken when the
    // boundary handed the object over would still show the old number.
    test('and follows a parameter that moves under a reused component', async () => {
        const { view, router } = await build('/note/7');

        expect(view.get('.double').text()).toBe('14');

        await router.push('/note/20');
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(view.get('.page').text()).toBe('note 20');
        expect(view.get('.double').text()).toBe('40');
    });

    test('and navigation swaps one Python component for another', async () => {
        const view = await page('/');

        await view.get('.vers').trigger('click');
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(view.get('.page').text()).toBe('note 7');
    });
});

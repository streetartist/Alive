<script setup lang="ts">
import type {
  PersonalWorldProject,
  PersonalWorldProjectStatus,
  PersonalWorldProjectUpdate,
} from '@proj-airi/companion-core'
import type { MemoryScope } from '@proj-airi/memory'

import type { WorldProjectCreation } from './worldProject'

import { errorMessageFrom } from '@moeru/std'
import { usePersonalWorldStore } from '@proj-airi/stage-ui/stores/modules/personal-world'
import { Button, Callout, DoubleCheckButton, Input, Select, Textarea } from '@proj-airi/ui'
import { computed, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import WorldProjectCreationPicker from './WorldProjectCreationPicker.vue'

const props = defineProps<{
  scope: MemoryScope
  creations: WorldProjectCreation[]
}>()

const { t, locale } = useI18n()
const personalWorldStore = usePersonalWorldStore()
const loading = shallowRef(false)
const savingId = shallowRef<string>()
const errorMessage = shallowRef('')
const feedbackMessage = shallowRef('')
const newTitle = ref('')
const newDescription = ref('')
const newCreationIds = ref<string[]>([])
const editingId = shallowRef<string>()
const editTitle = ref('')
const editDescription = ref('')
const editStatus = ref<PersonalWorldProjectStatus>('idea')
const editCreationIds = ref<string[]>([])

const projects = computed(() => personalWorldStore.getProjects(props.scope))
const creationById = computed(() => new Map(props.creations.map(creation => [creation.id, creation])))
const statusOptions = computed(() => (['idea', 'active', 'completed'] as const).map(status => ({
  value: status,
  label: t(`settings.pages.world.projects.status.${status}`),
})))
const dateFormatter = computed(() => new Intl.DateTimeFormat(locale.value, {
  dateStyle: 'medium',
  timeStyle: 'short',
}))

function resetCreateForm() {
  newTitle.value = ''
  newDescription.value = ''
  newCreationIds.value = []
}

function startEditing(project: PersonalWorldProject) {
  editingId.value = project.id
  editTitle.value = project.title
  editDescription.value = project.description
  editStatus.value = project.status
  editCreationIds.value = [...project.creationIds]
  errorMessage.value = ''
  feedbackMessage.value = ''
}

function stopEditing() {
  editingId.value = undefined
}

function linkedCreations(project: PersonalWorldProject) {
  return project.creationIds.map(id => creationById.value.get(id) ?? {
    id,
    title: t('settings.pages.world.projects.missingCreation'),
    url: null,
    createdAt: project.updatedAt,
    missing: true,
  })
}

function statusClasses(status: PersonalWorldProjectStatus) {
  if (status === 'completed')
    return ['bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300']
  if (status === 'active')
    return ['bg-primary-50 text-primary-700 dark:bg-primary-950/40 dark:text-primary-300']
  return ['bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300']
}

async function loadProjects() {
  loading.value = true
  errorMessage.value = ''
  try {
    await personalWorldStore.loadProjects({ ...props.scope })
  }
  catch (error) {
    errorMessage.value = errorMessageFrom(error) ?? t('settings.pages.world.errors.loadProjects')
  }
  finally {
    loading.value = false
  }
}

async function createProject() {
  savingId.value = 'new'
  errorMessage.value = ''
  feedbackMessage.value = ''
  try {
    await personalWorldStore.createProject({ ...props.scope }, {
      title: newTitle.value,
      description: newDescription.value,
      creationIds: newCreationIds.value,
    })
    resetCreateForm()
    feedbackMessage.value = t('settings.pages.world.feedback.projectCreated')
  }
  catch (error) {
    errorMessage.value = errorMessageFrom(error) ?? t('settings.pages.world.errors.saveProject')
  }
  finally {
    savingId.value = undefined
  }
}

async function updateProject() {
  const id = editingId.value
  if (!id)
    return

  savingId.value = id
  errorMessage.value = ''
  feedbackMessage.value = ''
  const update: PersonalWorldProjectUpdate = {
    title: editTitle.value,
    description: editDescription.value,
    status: editStatus.value,
    creationIds: editCreationIds.value,
  }
  try {
    await personalWorldStore.updateProject({ ...props.scope }, id, update)
    stopEditing()
    feedbackMessage.value = t('settings.pages.world.feedback.projectUpdated')
  }
  catch (error) {
    errorMessage.value = errorMessageFrom(error) ?? t('settings.pages.world.errors.saveProject')
  }
  finally {
    savingId.value = undefined
  }
}

async function removeProject(id: string) {
  savingId.value = `remove:${id}`
  errorMessage.value = ''
  feedbackMessage.value = ''
  try {
    await personalWorldStore.removeProject({ ...props.scope }, id)
    if (editingId.value === id)
      stopEditing()
    feedbackMessage.value = t('settings.pages.world.feedback.projectRemoved')
  }
  catch (error) {
    errorMessage.value = errorMessageFrom(error) ?? t('settings.pages.world.errors.removeProject')
  }
  finally {
    savingId.value = undefined
  }
}

watch(
  () => [props.scope.ownerId, props.scope.characterId],
  () => {
    stopEditing()
    feedbackMessage.value = ''
    void loadProjects()
  },
  { immediate: true },
)
</script>

<template>
  <section :class="['flex flex-col gap-4']" :aria-busy="loading">
    <div :class="['flex items-start gap-3']">
      <span aria-hidden="true" :class="['i-solar:palette-round-bold-duotone mt-0.5 text-2xl text-primary-500']" />
      <div>
        <h2 :class="['text-lg font-medium text-neutral-800 dark:text-neutral-100']">
          {{ t('settings.pages.world.projects.title') }}
        </h2>
        <p :class="['text-sm text-neutral-600 dark:text-neutral-400']">
          {{ t('settings.pages.world.projects.description') }}
        </p>
      </div>
    </div>

    <p
      v-if="feedbackMessage"
      role="status"
      :class="['rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300']"
    >
      {{ feedbackMessage }}
    </p>

    <Callout v-if="errorMessage" theme="orange">
      <template #label>
        {{ t('settings.pages.world.errors.title') }}
      </template>
      {{ errorMessage }}
    </Callout>

    <form
      :class="[
        'flex flex-col gap-4 rounded-xl border-2 p-4',
        'border-primary-100/70 bg-primary-50/30 dark:border-primary-900/50 dark:bg-primary-950/15',
      ]"
      @submit.prevent="createProject"
    >
      <div>
        <h3 :class="['font-medium text-neutral-800 dark:text-neutral-100']">
          {{ t('settings.pages.world.projects.form.newTitle') }}
        </h3>
        <p :class="['text-sm text-neutral-500 dark:text-neutral-400']">
          {{ t('settings.pages.world.projects.form.newDescription') }}
        </p>
      </div>
      <label :class="['grid gap-1.5 text-sm text-neutral-700 dark:text-neutral-200']">
        <span>{{ t('settings.pages.world.projects.form.title') }}</span>
        <Input v-model="newTitle" required :placeholder="t('settings.pages.world.projects.form.titlePlaceholder')" />
      </label>
      <label :class="['grid gap-1.5 text-sm text-neutral-700 dark:text-neutral-200']">
        <span>{{ t('settings.pages.world.projects.form.description') }}</span>
        <Textarea v-model="newDescription" required :placeholder="t('settings.pages.world.projects.form.descriptionPlaceholder')" />
      </label>
      <WorldProjectCreationPicker v-model:selected-ids="newCreationIds" :creations="creations" :disabled="savingId !== undefined" />
      <div :class="['flex justify-end']">
        <Button type="submit" :loading="savingId === 'new'" :disabled="savingId !== undefined">
          {{ t('settings.pages.world.projects.form.create') }}
        </Button>
      </div>
    </form>

    <div
      v-if="loading && projects.length === 0"
      role="status"
      :class="['flex items-center justify-center gap-2 rounded-xl border-2 border-neutral-200/60 px-4 py-8 text-sm text-neutral-500 dark:border-neutral-800']"
    >
      <span aria-hidden="true" :class="['i-svg-spinners:180-ring text-lg']" />
      {{ t('settings.pages.world.projects.loading') }}
    </div>
    <div
      v-else-if="projects.length === 0"
      :class="[
        'rounded-xl border-2 border-dashed px-4 py-8 text-center text-sm',
        'border-neutral-200/70 bg-neutral-50/60 text-neutral-500',
        'dark:border-neutral-800 dark:bg-neutral-900/30 dark:text-neutral-400',
      ]"
    >
      {{ t('settings.pages.world.projects.empty') }}
    </div>

    <ul v-else role="list" :class="['grid gap-3 lg:grid-cols-2']">
      <li
        v-for="project in projects"
        :key="project.id"
        :class="[
          'flex flex-col gap-4 rounded-xl border-2 p-4 shadow-sm',
          'border-neutral-200/50 bg-white/70 dark:border-neutral-800/60 dark:bg-neutral-900/60',
        ]"
      >
        <form v-if="editingId === project.id" :class="['flex flex-col gap-4']" @submit.prevent="updateProject">
          <label :class="['grid gap-1.5 text-sm text-neutral-700 dark:text-neutral-200']">
            <span>{{ t('settings.pages.world.projects.form.title') }}</span>
            <Input v-model="editTitle" required />
          </label>
          <label :class="['grid gap-1.5 text-sm text-neutral-700 dark:text-neutral-200']">
            <span>{{ t('settings.pages.world.projects.form.description') }}</span>
            <Textarea v-model="editDescription" required />
          </label>
          <label :class="['grid gap-1.5 text-sm text-neutral-700 dark:text-neutral-200']">
            <span>{{ t('settings.pages.world.projects.form.status') }}</span>
            <Select v-model="editStatus" :options="statusOptions" />
          </label>
          <WorldProjectCreationPicker v-model:selected-ids="editCreationIds" :creations="creations" :disabled="savingId !== undefined" />
          <div :class="['flex flex-wrap justify-end gap-2']">
            <Button type="button" variant="secondary" :disabled="savingId !== undefined" @click="stopEditing">
              {{ t('settings.pages.world.projects.form.cancel') }}
            </Button>
            <Button type="submit" :loading="savingId === project.id" :disabled="savingId !== undefined">
              {{ t('settings.pages.world.projects.form.save') }}
            </Button>
          </div>
        </form>

        <template v-else>
          <div :class="['flex items-start justify-between gap-3']">
            <div>
              <h3 :class="['font-medium text-neutral-800 dark:text-neutral-100']">
                {{ project.title }}
              </h3>
              <time :datetime="new Date(project.updatedAt).toISOString()" :class="['text-xs text-neutral-500 dark:text-neutral-400']">
                {{ t('settings.pages.world.projects.updated', { date: dateFormatter.format(project.updatedAt) }) }}
              </time>
            </div>
            <span :class="['shrink-0 rounded-full px-2 py-1 text-xs', ...statusClasses(project.status)]">
              {{ t(`settings.pages.world.projects.status.${project.status}`) }}
            </span>
          </div>
          <p :class="['whitespace-pre-wrap text-sm leading-6 text-neutral-700 dark:text-neutral-200']">
            {{ project.description }}
          </p>

          <ul v-if="project.creationIds.length" role="list" :class="['grid grid-cols-2 gap-2 sm:grid-cols-3']">
            <li
              v-for="creation in linkedCreations(project)"
              :key="creation.id"
              :class="['relative aspect-video overflow-hidden rounded-lg bg-neutral-100 dark:bg-neutral-800']"
            >
              <img v-if="creation.url" :src="creation.url" :alt="creation.title" :class="['h-full w-full object-cover']">
              <span v-else aria-hidden="true" :class="['flex h-full items-center justify-center i-solar:gallery-remove-bold-duotone text-2xl text-neutral-400']" />
              <span :class="['absolute inset-x-0 bottom-0 truncate bg-black/65 px-2 py-1 text-xs text-white']">
                {{ creation.title }}
              </span>
            </li>
          </ul>
          <p v-else :class="['text-xs text-neutral-500 dark:text-neutral-400']">
            {{ t('settings.pages.world.projects.noLinkedCreations') }}
          </p>

          <div :class="['mt-auto flex flex-wrap justify-end gap-2']">
            <Button variant="secondary" size="sm" :disabled="savingId !== undefined" @click="startEditing(project)">
              {{ t('settings.pages.world.projects.actions.edit') }}
            </Button>
            <DoubleCheckButton
              variant="danger"
              size="sm"
              :disabled="savingId !== undefined"
              :loading="savingId === `remove:${project.id}`"
              @confirm="removeProject(project.id)"
            >
              {{ t('settings.pages.world.projects.actions.remove') }}
              <template #confirm>
                {{ t('settings.pages.world.projects.actions.removeConfirm') }}
              </template>
              <template #cancel>
                {{ t('settings.pages.world.projects.actions.cancelRemove') }}
              </template>
            </DoubleCheckButton>
          </div>
        </template>
      </li>
    </ul>
  </section>
</template>

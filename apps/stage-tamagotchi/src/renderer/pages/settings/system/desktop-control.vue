<script setup lang="ts">
import type { ElectronDesktopControlPolicy } from '../../../../shared/eventa'

import { useElectronEventaInvoke } from '@proj-airi/electron-vueuse'
import { useAnalytics } from '@proj-airi/stage-ui/composables'
import { Button, Callout, FieldCheckbox } from '@proj-airi/ui'
import { computed, onMounted, ref, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'

import {
  electronDesktopClearEmergencyStop,
  electronDesktopGetPolicy,
  electronDesktopSetPolicy,
} from '../../../../shared/eventa'
import { useTamagotchiDesktopControlToolsStore } from '../../../stores/desktop-control-tools'

const getPolicy = useElectronEventaInvoke(electronDesktopGetPolicy)
const setPolicy = useElectronEventaInvoke(electronDesktopSetPolicy)
const clearEmergencyStop = useElectronEventaInvoke(electronDesktopClearEmergencyStop)
const desktopControlToolsStore = useTamagotchiDesktopControlToolsStore()
const { trackSettingsChanged } = useAnalytics()
const { t } = useI18n()
const tt = (key: string) => t(`tamagotchi.settings.pages.system.desktop-control.${key}`)

async function syncRuntimeTools() {
  try {
    await desktopControlToolsStore.refresh()
  }
  catch (error) {
    console.warn('[desktop-control settings] Failed to refresh runtime tools:', error)
  }
}

const loading = ref(true)
const saving = ref(false)
const policy = shallowRef<ElectronDesktopControlPolicy>({
  enabled: false,
  requireUserConfirmation: true,
  killSwitched: false,
  maxListedWindows: 12,
})

const enabled = computed({
  get: () => policy.value.enabled === true,
  set: (value: boolean) => {
    // Only patch the master switch — never touch confirmation mode here.
    void updatePolicy({ enabled: value })
  },
})

/**
 * Always-allow (dangerous): when true, OS confirmation dialogs are skipped.
 * Maps to `requireUserConfirmation = false` in main-process policy.
 * Independent from the master enable switch.
 */
const alwaysAllow = computed({
  get: () => policy.value.requireUserConfirmation === false,
  set: (value: boolean) => {
    // Only patch confirmation mode — never touch enabled here.
    void updatePolicy({ requireUserConfirmation: !value })
  },
})

const killSwitched = computed(() => policy.value.killSwitched)

async function refreshPolicy() {
  loading.value = true
  try {
    policy.value = await getPolicy()
  }
  catch {
    toast.error(tt('errors.load'))
  }
  finally {
    loading.value = false
  }
}

async function updatePolicy(update: {
  enabled?: boolean
  requireUserConfirmation?: boolean
}) {
  if (saving.value)
    return

  saving.value = true
  try {
    const next = await setPolicy(update)
    policy.value = next

    if (update.enabled !== undefined) {
      trackSettingsChanged({
        setting_name: 'desktop_control_enabled',
        new_value: next.enabled ? 'on' : 'off',
        source: 'settings',
      })
      // Gate LLM tool injection on the master switch.
      await syncRuntimeTools()
    }
    if (update.requireUserConfirmation !== undefined) {
      trackSettingsChanged({
        setting_name: 'desktop_control_always_allow',
        new_value: next.requireUserConfirmation ? 'off' : 'on',
        source: 'settings',
      })
    }

    if (update.requireUserConfirmation === false)
      toast.warning(tt('always-allow.toast'))
  }
  catch {
    toast.error(tt('errors.save'))
    await refreshPolicy()
  }
  finally {
    saving.value = false
  }
}

async function handleClearEmergencyStop() {
  saving.value = true
  try {
    policy.value = await clearEmergencyStop()
    toast.success(tt('emergency-stop.cleared'))
    await syncRuntimeTools()
  }
  catch {
    toast.error(tt('errors.save'))
  }
  finally {
    saving.value = false
  }
}

onMounted(() => {
  void refreshPolicy()
})
</script>

<template>
  <div :class="['flex flex-col gap-4 font-normal']">
    <Callout
      v-if="killSwitched"
      theme="orange"
      :label="tt('emergency-stop.title')"
    >
      <div :class="['flex flex-col gap-3']">
        <p :class="['text-xs leading-relaxed']">
          {{ tt('emergency-stop.description') }}
        </p>
        <div>
          <Button
            size="md"
            :disabled="saving || loading"
            :label="tt('emergency-stop.clear')"
            @click="handleClearEmergencyStop"
          />
        </div>
      </div>
    </Callout>

    <section :class="['flex flex-col gap-4 rounded-lg bg-neutral-50 p-4 dark:bg-neutral-800']">
      <div>
        <h2 :class="['text-sm text-neutral-900 font-medium dark:text-neutral-50']">
          {{ tt('section.title') }}
        </h2>
        <p :class="['mt-1 text-xs text-neutral-500 leading-relaxed dark:text-neutral-400']">
          {{ tt('section.description') }}
        </p>
      </div>

      <FieldCheckbox
        v-model="enabled"
        :disabled="loading || saving || killSwitched"
        :label="tt('enabled.label')"
        :description="tt('enabled.description')"
      />

      <FieldCheckbox
        v-model="alwaysAllow"
        :disabled="loading || saving || killSwitched || !enabled"
        :label="tt('always-allow.label')"
        :description="tt('always-allow.description')"
      />

      <p :class="['text-xs text-neutral-500 leading-relaxed dark:text-neutral-400']">
        {{ tt('hints.emergency-shortcut') }}
      </p>
    </section>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: tamagotchi.settings.pages.system.desktop-control.title
  subtitleKey: settings.title
  stageTransition:
    name: slide
</route>

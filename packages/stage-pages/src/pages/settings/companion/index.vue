<script setup lang="ts">
import CompanionManager from './components/CompanionManager.vue'
</script>

<template>
  <CompanionManager />
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: settings.pages.companion.title
  subtitleKey: settings.title
  descriptionKey: settings.pages.companion.description
  icon: i-solar:stars-bold-duotone
  settingsEntry: true
  order: 4
  stageTransition:
    name: slide
</route>

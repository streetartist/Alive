<script setup lang="ts">
import PersonalWorldManager from './components/PersonalWorldManager.vue'
</script>

<template>
  <PersonalWorldManager />
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: settings.pages.world.title
  subtitleKey: settings.title
  descriptionKey: settings.pages.world.description
  icon: i-solar:planet-3-bold-duotone
  settingsEntry: true
  order: 5
  stageTransition:
    name: slide
</route>

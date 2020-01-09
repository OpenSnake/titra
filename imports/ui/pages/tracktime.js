import { Meteor } from 'meteor/meteor'
import { Template } from 'meteor/templating'
import { FlowRouter } from 'meteor/ostrio:flow-router-extra'
import moment from 'moment'
import i18next from 'i18next'
import TinyDatePicker from 'tiny-date-picker'
import 'tiny-date-picker/tiny-date-picker.css'

import Timecards from '../../api/timecards/timecards.js'
import Projects from '../../api/projects/projects.js'

import './tracktime.html'
import '../components/projectselect.js'
import '../components/tasksearch.js'
import '../components/timetracker.js'
import '../components/weektable.js'
import '../components/calendar.js'
import '../components/backbutton.js'

Template.tracktime.onRendered(() => {
  Template.instance().tinydatepicker = TinyDatePicker('#date', {
    format(date) {
      return date ? moment(date).format('ddd, DD.MM.YYYY') : moment().format('ddd, DD.MM.YYYY')
    },
    parse(date) {
      return moment(date, 'ddd, DD.MM.YYYY')
    },
    mode: 'dp-modal',
    dayOffset: 1,
  }).on('select', (_, dp) => {
    if (!dp.state.selectedDate) {
      $('#date').val(moment().format('ddd, DD.MM.YYYY'))
    }
  })
})
Template.tracktime.onCreated(function tracktimeCreated() {
  import('mathjs').then((mathjs) => {
    this.math = mathjs
  })
  this.date = new ReactiveVar(new Date())
  this.projectId = new ReactiveVar(FlowRouter.getParam('projectId'))
  if (FlowRouter.getParam('tcid')) {
    this.subscribe('singleTimecard', FlowRouter.getParam('tcid'))
    this.autorun(() => {
      if (this.subscriptionsReady()) {
        this.date.set(Timecards.findOne() ? Timecards.findOne().date : new Date())
      }
    })
  }
  this.totalTime = new ReactiveVar(0)
  let handle
  this.autorun(() => {
    if (FlowRouter.getQueryParam('date')) {
      this.date.set(moment(FlowRouter.getQueryParam('date'), 'YYYY-MM-DD').toDate())
    }
    if (!FlowRouter.getParam('tcid')) {
      handle = this.subscribe('myTimecardsForDate', { date: moment(this.date.get()).format('YYYY-MM-DD') })
      if (handle.ready()) {
        Timecards.find().forEach((timecard) => {
          this.subscribe('publicProjectName', timecard.projectId)
        })
      }
    }
    if (this.subscriptionsReady()) {
      this.totalTime.set(Timecards.find()
        .fetch().reduce((a, b) => (a === 0 ? b.hours : a + b.hours), 0))
      if (FlowRouter.getParam('projectId') && !FlowRouter.getQueryParam('date')) {
        if (FlowRouter.getParam('projectId') !== 'all') {
          if ($('.js-tasksearch-input')) {
            $('.js-tasksearch-input').focus()
          }
        }
      }
    }
  })
})
Template.tracktime.events({
  'click .js-save': (event, templateInstance) => {
    event.preventDefault()
    if (!$('#hours').val()) {
      $.notify({ message: i18next.t('notifications.enter_time') }, { type: 'danger' })
      return
    }
    if (!templateInstance.$('#targetProject').val()) {
      $.notify({ message: i18next.t('notifications.select_project') }, { type: 'danger' })
      return
    }
    try {
      templateInstance.math.evaluate($('#hours').val())
    } catch (exception) {
      $.notify({ message: i18next.t('notifications.check_time_input') }, { type: 'danger' })
      return
    }
    const projectId = templateInstance.$('#targetProject').val()
    const task = templateInstance.$('.js-tasksearch-input').val()
    const date = moment.utc($('#date').val(), 'ddd, DD.MM.YYYY').toDate()
    let hours = templateInstance.math.evaluate($('#hours').val())

    if (Meteor.user().profile.timeunit === 'd') {
      hours = templateInstance.math.evaluate(templateInstance.$('#hours').val()) * (Meteor.user().profile.hoursToDays ? Meteor.user().profile.hoursToDays : 8)
    }
    const buttonLabel = $(event.currentTarget).text()
    templateInstance.$(event.currentTarget).text('saving ...')
    templateInstance.$(event.currentTarget).prop('disabled', true)
    if (FlowRouter.getParam('tcid')) {
      Meteor.call('updateTimeCard', {
        _id: FlowRouter.getParam('tcid'), projectId, date, hours, task,
      }, (error) => {
        if (error) {
          console.error(error)
        } else {
          templateInstance.$('.js-tasksearch-results').addClass('d-none')
          $.notify(i18next.t('notifications.time_entry_updated'))
          templateInstance.$(event.currentTarget).text(buttonLabel)
          templateInstance.$(event.currentTarget).prop('disabled', false)
          templateInstance.$('.js-show-timecards').removeClass('d-none')
          templateInstance.$('[data-toggle="tooltip"]').tooltip()
          // window.history.back()
        }
      })
    } else {
      Meteor.call('insertTimeCard', {
        projectId: $('#targetProject').val(), date, hours, task,
      }, (error) => {
        if (error) {
          console.error(error)
        } else {
          templateInstance.$('.js-tasksearch-input').val('')
          templateInstance.$('.js-tasksearch-input').keyup()
          templateInstance.$('#hours').val('')
          templateInstance.$('.js-tasksearch-results').addClass('d-none')
          $.notify(i18next.t('notifications.time_entry_saved'))
          templateInstance.$(event.currentTarget).text(buttonLabel)
          templateInstance.$(event.currentTarget).prop('disabled', false)
          templateInstance.$('.js-show-timecards').removeClass('d-none')
          templateInstance.$('[data-toggle="tooltip"]').tooltip()
        }
      })
    }
  },
  'click .js-previous': (event, templateInstance) => {
    event.preventDefault()
    FlowRouter.setQueryParams({ date: moment(templateInstance.date.get()).subtract(1, 'days').format('YYYY-MM-DD') })
    // templateInstance.date.set(new Date(moment(templateInstance.date.get())
    // .subtract(1, 'days').utc()))
    templateInstance.$('#hours').val('')
    templateInstance.$('.js-tasksearch-results').addClass('d-none')
  },
  'click .js-next': (event, templateInstance) => {
    event.preventDefault()
    FlowRouter.setQueryParams({ date: moment(templateInstance.date.get()).add(1, 'days').format('YYYY-MM-DD') })
    // templateInstance.date.set(new Date(moment(templateInstance.date.get()).add(1, 'days').utc()))
    templateInstance.$('#hours').val('')
    templateInstance.$('.js-tasksearch-results').addClass('d-none')
  },
  'change #targetProject': (event, templateInstance) => {
    templateInstance.projectId.set(templateInstance.$(event.currentTarget).val())
    templateInstance.$('.js-tasksearch').focus()
  },
  'change #date': (event, templateInstance) => {
    if ($(event.currentTarget).val()) {
      let date = moment(templateInstance.$(event.currentTarget).val(), 'ddd, DD.MM.YYYY')
      if (!date.isValid()) {
        date = moment()
        event.currentTarget.valueAsDate = date.toDate()
      }
      date = date.format('YYYY-MM-DD')
      // we need this to correctly capture calender change events from the input
      FlowRouter.setQueryParams({ date })
    }
    // templateInstance.date.set($(event.currentTarget).val())
  },
  'click .js-toggle-timecards': (event, templateInstance) => {
    event.preventDefault()
    templateInstance.$('.js-show-timecards').slideToggle('fast')
    templateInstance.$('[data-toggle="tooltip"]').tooltip()
  },
  'click .js-time-row': (event, templateInstance) => {
    event.preventDefault()
    templateInstance.$(event.currentTarget).popover({
      trigger: 'manual',
      container: templateInstance.$('form'),
      html: true,
      content: templateInstance.$(event.currentTarget).children('.js-popover-content').html(),
    })
    templateInstance.$(event.currentTarget).popover('toggle')
  },
  'click .js-delete-time-entry': (event, templateInstance) => {
    event.preventDefault()
    templateInstance.$('.js-time-row').popover('dispose')
    const timecardId = event.currentTarget.href.split('/').pop()
    Meteor.call('deleteTimeCard', { timecardId }, (error, result) => {
      if (!error) {
        $.notify(i18next.t('notifications.time_entry_deleted'))
      } else {
        console.error(error)
      }
    })
  },
  'click .js-open-calendar': (event, templateInstance) => {
    event.preventDefault()
    templateInstance.tinydatepicker.open()
  },
})
Template.tracktime.helpers({
  date: () => moment(Template.instance().date.get()).format('ddd, DD.MM.YYYY'),
  projectId: () => {
    if (FlowRouter.getParam('projectId')) {
      return FlowRouter.getParam('projectId')
    }
    return Timecards.findOne({ _id: FlowRouter.getParam('tcid') }) ? Timecards.findOne({ _id: FlowRouter.getParam('tcid') }).projectId : false
  },
  projectName: (_id) => (Projects.findOne({ _id }) ? Projects.findOne({ _id }).name : false),
  timecards: () => Timecards.find(),
  isEdit: () => FlowRouter.getParam('tcid'),
  task: () => (Timecards.findOne({ _id: FlowRouter.getParam('tcid') }) ? Timecards.findOne({ _id: FlowRouter.getParam('tcid') }).task : false),
  hours: () => (Timecards.findOne({ _id: FlowRouter.getParam('tcid') }) ? Timecards.findOne({ _id: FlowRouter.getParam('tcid') }).hours : false),
  showTracker: () => (Meteor.user() ? (Meteor.user().profile.timeunit !== 'd') : false),
  totalTime: () => Template.instance().totalTime.get(),
  previousDay: () => moment(Template.instance().date.get()).subtract(1, 'day').format('ddd, DD.MM.YYYY'),
  nextDay: () => moment(Template.instance().date.get()).add(1, 'day').format('ddd, DD.MM.YYYY'),
  borderClass: () => (FlowRouter.getParam('tcid') ? '' : 'tab-borders'),
})

Template.tracktimemain.onCreated(function tracktimeCreated() {
  this.timetrackview = new ReactiveVar(Meteor.user() ? Meteor.user().profile.timetrackview || 'd' : 'd')
  this.autorun(() => {
    if (FlowRouter.getParam('projectId')) {
      this.timetrackview.set('d')
    } else if (FlowRouter.getQueryParam('view')) {
      this.timetrackview.set(FlowRouter.getQueryParam('view'))
    }
  })
})

Template.tracktimemain.helpers({
  showDay: () => (Template.instance().timetrackview.get() === 'd' ? 'active' : ''),
  showWeek: () => (Template.instance().timetrackview.get() === 'w' ? 'active' : ''),
  showMonth: () => (Template.instance().timetrackview.get() === 'M' ? 'active' : ''),
})

Template.tracktimemain.events({
  'click .js-day': (event) => {
    event.preventDefault()
    FlowRouter.setQueryParams({ view: 'd' })
  },
  'click .js-week': (event) => {
    event.preventDefault()
    FlowRouter.setParams({ projectId: '' })
    FlowRouter.setQueryParams({ view: 'w' })
  },
  'click .js-month': (event) => {
    event.preventDefault()
    FlowRouter.setParams({ projectId: '' })
    FlowRouter.setQueryParams({ view: 'M' })
  },
})

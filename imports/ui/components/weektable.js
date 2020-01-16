import moment from 'moment'
import i18next from 'i18next'
import { FlowRouter } from 'meteor/ostrio:flow-router-extra'
import './weektable.html'
import './tasksearch'
import Projects from '../../api/projects/projects'
import { clientTimecards, getWeekDays, timeInUserUnit } from '../../utils/frontend_helpers'

Template.weektable.onCreated(function weekTableCreated() {
  this.subscribe('myprojects')
  // attention: this is a workaround because we are currently hard coding the european week format
  // where weeks start on Monday - in the future this needs to be updated based on a user specific
  // 'start of the week' setting
  this.startDate = new ReactiveVar(moment(moment().startOf('week').add(1, 'day')))
  this.endDate = new ReactiveVar(moment(moment().endOf('week').add(1, 'day')))
  this.autorun(() => {
    if (FlowRouter.getQueryParam('date')) {
      this.startDate.set(moment(moment(FlowRouter.getQueryParam('date')).startOf('week').add(1, 'day')), 'YYYY-MM-DD')
      this.endDate.set(moment(moment(FlowRouter.getQueryParam('date')).endOf('week').add(1, 'day')), 'YYYY-MM-DD')
    }
  })
})

Template.weektable.helpers({
  weekDays() {
    return getWeekDays(Template.instance().startDate.get())
  },
  projects() {
    return Projects.find({ $or: [{ archived: { $exists: false } }, { archived: false }] })
  },
  startDate() { return Template.instance().startDate },
  endDate() { return Template.instance().endDate },
  getTotalForDay(day) {
    let total = 0
    if (!Meteor.loggingIn() && Meteor.user() && Meteor.user().profile) {
      clientTimecards.find().fetch().forEach((element) => {
        if (element.entries) {
          total += element.entries.filter((entry) => moment(entry.date).format('ddd, DD.MM') === day)
            .reduce((tempTotal, current) => tempTotal + Number(current.hours), 0)
        }
      })
      return total !== 0 ? timeInUserUnit(total) : false
    }
    return false
  },
  hasData() {
    return clientTimecards.find().fetch().length > 0
  },
})

Template.weektable.events({
  'click .js-previous-week': (event, templateInstance) => {
    event.preventDefault()
    FlowRouter.setQueryParams({ date: moment(templateInstance.startDate.get()).subtract(1, 'week').format('YYYY-MM-DD') })
  },
  'click .js-next-week': (event, templateInstance) => {
    event.preventDefault()
    FlowRouter.setQueryParams({ date: moment(templateInstance.startDate.get()).add(1, 'week').format('YYYY-MM-DD') })
  },
  'click .js-save': (event, templateInstance) => {
    event.preventDefault()
    const weekArray = []
    templateInstance.$('.js-hours').each((index, element) => {
      const startDate = templateInstance.startDate.get().clone().startOf('week')
      const value = templateInstance.$(element).val()
      if (value) {
        const newTaskInput = templateInstance.$(element.parentElement.parentElement).find('.js-tasksearch-input').val()
        const task = templateInstance.$(element).data('task') ? templateInstance.$(element).data('task') : newTaskInput
        if (!task) {
          $.notify({ message: i18next.t('notifications.enter_task') }, { type: 'danger' })
          return
        }
        let hours = Number(value)
        if (Meteor.user().profile.timeunit === 'd') {
          hours *= (Meteor.user().profile.hoursToDays ? Meteor.user().profile.hoursToDays : 8)
        }
        weekArray.push({
          projectId: $(element).data('project-id'),
          task,
          date: moment.utc(startDate.add(Number(templateInstance.$(element).data('week-day')) + 1, 'day').format('YYYY-MM-DD')).toDate(),
          hours,
        })
      }
    })
    if (weekArray.length > 0) {
      Meteor.call('upsertWeek', weekArray, (error) => {
        if (error) {
          console.error(error)
        } else {
          templateInstance.$('.js-tasksearch-input').val('')
          templateInstance.$('.js-tasksearch-input').parent().parent().find('.js-hours')
            .val('')
          $.notify(i18next.t('notifications.time_entry_updated'))
        }
      })
    }
  },
})

Template.weektablerow.onCreated(function weektablerowCreated() {
  this.tempTimeEntries = new ReactiveVar([])
  this.autorun(() => {
    this.subscribe('userTimeCardsForPeriodByProjectByTask',
      {
        projectId: Template.instance().data.projectId,
        startDate: Template.instance().data.startDate.get().toDate(),
        endDate: Template.instance().data.endDate.get().toDate(),
      })
  })
})
Template.weektablerow.events({
  'click .js-newline': (event, templateInstance) => {
    event.preventDefault()
    templateInstance.tempTimeEntries.set(templateInstance.tempTimeEntries.get().push({ _id: '' }))
  },
})
Template.weektablerow.helpers({
  weekDays() {
    return getWeekDays(Template.instance().data.startDate.get())
  },
  tasks() {
    return clientTimecards.find(
      {
        entries:
        {
          $elemMatch:
          {
            projectId: Template.instance().data.projectId,
          },
        },
      },
    ).fetch().map((entry) => ({ _id: entry._id.split('|')[1], entries: entry.entries })).concat(Template.instance().tempTimeEntries.get())
  },
  getHoursForDay(day, task) {
    if (task.entries) {
      const entryForDay = task.entries
        .filter((entry) => moment(entry.date).format('ddd, DD.MM') === day)
        .reduce(((total, element) => total + element.hours), 0)
      return entryForDay !== 0 ? timeInUserUnit(entryForDay) : ''
    }
    return ''
  },
  getTotalForTask(task) {
    if (task.entries) {
      if (!Meteor.loggingIn() && Meteor.user() && Meteor.user().profile) {
        const total = task.entries
          .reduce((tempTotal, amount) => tempTotal + Number(amount.hours), 0)
        return total !== 0 ? timeInUserUnit(total) : ''
      }
    }
    return ''
  },
  getTotalForDayPerProject(projectId, day) {
    let total = 0
    if (!Meteor.loggingIn() && Meteor.user() && Meteor.user().profile) {
      clientTimecards.find(
        {
          entries:
          {
            $elemMatch:
            {
              projectId,
            },
          },
        },
      ).fetch().concat(Template.instance().tempTimeEntries.get()).forEach((element) => {
        if (element.entries) {
          total += element.entries.filter((entry) => moment(entry.date).format('ddd, DD.MM') === day)
            .reduce((tempTotal, current) => tempTotal + Number(current.hours), 0)
        }
      })
      return total !== 0 ? timeInUserUnit(total) : false
    }
    return false
  },
})

import { FlowRouter } from 'meteor/ostrio:flow-router-extra'
import moment from 'moment'
import randomColor from 'randomcolor'
import emoji from 'node-emoji'
import './dashboard.html'
import Timecards from '../../api/timecards/timecards'
import Projects from '../../api/projects/projects'
import { Dashboards } from '../../api/dashboards/dashboards'

function timeInUnitHelper(hours) {
  if (Dashboards.findOne()) {
    if (Dashboards.findOne().timeunit === 'd') {
      return Dashboards.findOne().hoursToDays
        ? Number(hours / Dashboards.findOne().hoursToDays) : Number(hours / 8)
    }
  }
  return hours
}

Template.dashboard.onCreated(function dashboardCreated() {
  let handle
  this.totalHours = new ReactiveVar(0)
  this.autorun(() => {
    if (FlowRouter.getParam('_id')) {
      this.subscribe('dashboardByIdDetails', FlowRouter.getParam('_id'))
      // this.subscribe('dashboardAggregation', { dashboardId: FlowRouter.getParam('_id') })
      handle = this.subscribe('dashboardById', FlowRouter.getParam('_id'))
      if (handle.ready()) {
        if (Dashboards.findOne()) {
          if (Dashboards.findOne().projectId !== 'all') {
            this.subscribe('publicProjectName', Timecards.findOne().projectId)
          } else {
            this.subscribe('dashboardUser', { _id: Dashboards.findOne()._id })
          }
        }
      }
    }
  })
})
Template.dashboard.onRendered(function dashboardRendered() {
  import('chart.js').then((chartModule) => {
    const Chart = chartModule.default
    const replacer = (match) => emoji.emojify(match)
    this.autorun(() => {
      if (this.subscriptionsReady()) {
        let temphours = 0
        this.totalHours.set(0)
        const taskmap = new Map()
        const datemap = new Map()
        for (const timecard of Timecards.find({}, { sort: { date: 1 } }).fetch()) {
          taskmap.set(
            timecard.task.replace(/(:.*:)/g, replacer),
            taskmap.get(timecard.task.replace(/(:.*:)/g, replacer))
              ? Number(taskmap.get(timecard.task.replace(/(:.*:)/g, replacer))) + timeInUnitHelper(Number(timecard.hours))
              : timeInUnitHelper(timecard.hours),
          )
          datemap.set(
            moment(timecard.date).format('DDMMYYYY'),
            datemap.get(moment(timecard.date).format('DDMMYYYY'))
              ? Number(datemap.get(moment(timecard.date).format('DDMMYYYY'))) + timeInUnitHelper(Number(timecard.hours))
              : timeInUnitHelper(timecard.hours),
          )
          temphours += timecard.hours
        }
        this.totalHours.set(temphours)
        if (this.linechart) {
          this.linechart.clear()
          this.linechart.destroy()
        }
        this.$('.js-line-chart').remove()
        this.$('.js-linechart-container').html('<canvas class="js-line-chart" style="width:100%;height:300px;"></canvas>')
        if (!this.$('.js-line-chart')[0]) {
          return
        }
        const timearray = []
        datemap.forEach((value, key) => {
          timearray.push({ t: key, y: value })
        })
        const linechartctx = this.$('.js-line-chart')[0].getContext('2d')
        this.linechart = new Chart(linechartctx, {
          type: 'bar',
          data: {
            labels:
              [...datemap.keys()],
            datasets: [{
              fill: true,
              backgroundColor: 'rgba(75,192,192,0.4)',
              borderColor: 'rgba(0, 150, 136, 0.8)',
              hoverBackgroundColor: 'rgba(0, 150, 136, 0.8)',
              hoverBorderColor: 'rgba(220,220,220,1)',
              data: timearray,
            }],
          },
          options: {
            bounds: 'ticks',
            legend: {
              display: false,
            },
            tooltips: {
              mode: 'label',
              callbacks: {
                label: (tooltipItem, data) => `${data.datasets[0].data[tooltipItem.index].y} ${(Dashboards.findOne().timeunit === 'd' ? 'Days' : 'Hours')}`,
              },
            },
            scales: {
              yAxes: [{
                ticks: {
                  beginAtZero: true,
                },
              }],
              xAxes: [{
                type: 'time',
                time: {
                  unit: 'day',
                  tooltipFormat: 'DD.MM.YYYY',
                  parser: 'DDMMYYYY',
                },
                ticks: {
                  source: 'labels',
                },
              }],
            },
          },
        })
        this.$('.js-pie-chart').remove()
        this.$('.js-piechart-container').html('<canvas class="js-pie-chart" style="width:100%;height:300px;"></canvas>')
        const piechartctx = this.$('.js-pie-chart')[0].getContext('2d')
        this.piechart = new Chart(piechartctx, {
          type: 'pie',
          data: {
            labels:
              [...taskmap.keys()],
            datasets: [{
              backgroundColor: randomColor({ hue: 'blue', luminosity: 'dark', count: taskmap.size }),
              // borderColor: 'rgba(0, 150, 136, 0.8)',
              // hoverBackgroundColor: 'rgba(0, 150, 136, 0.8)',
              // hoverBorderColor: 'rgba(220,220,220,1)',
              data: [...taskmap.values()],
            }],
          },
          options: {
            tooltips: {
              mode: 'label',
              callbacks: {
                label: (tooltipItem, data) => `${data.datasets[0].data[tooltipItem.index]} ${(Dashboards.findOne().timeunit === 'd' ? 'Days' : 'Hours')}`,
              },
            },
            legend: {
              position: 'bottom',
            },
          },
        })
      }
    })
  })
})
Template.dashboard.helpers({
  timecards: () => Timecards.find(),
  projectName: () => (Projects.findOne() ? Projects.findOne().name : false),
  formatDate: (date) => moment(date).format('ddd DD.MM.YYYY'),
  timeunit: () => {
    if (Dashboards.findOne()) {
      return Dashboards.findOne().timeunit === 'd' ? 'Days' : 'Hours'
    }
    return false
  },
  startDate: () => (Dashboards.findOne() ? moment(Dashboards.findOne().startDate).format('DD.MM.YYYY') : false),
  endDate: () => (Dashboards.findOne() ? moment(Dashboards.findOne().endDate).format('DD.MM.YYYY') : false),
  dashBoardResource: () => (Dashboards.findOne()
    ? (Meteor.users.findOne(Dashboards.findOne().resourceId)
      ? Meteor.users.findOne(Dashboards.findOne().resourceId).profile.name : false) : false),
  customer: () => (Dashboards.findOne() ? Dashboards.findOne().customer : false),
  isCustomerDashboard: () => (Dashboards.findOne() ? (Dashboards.findOne().customer && Dashboards.findOne().customer !== 'all') : false),
  timeInUnit: (hours) => timeInUnitHelper(hours),
  totalHours: () => {
    if (Dashboards.findOne()) {
      if (Dashboards.findOne().timeunit === 'd') {
        let precision = 2
        if (!Meteor.loggingIn() && Meteor.user() && Meteor.user().profile) {
          precision = Meteor.user().profile.precision ? Meteor.user().profile.precision : 2
        }
        return Dashboards.findOne().hoursToDays
          ? Number(Template.instance().totalHours.get() / Dashboards.findOne().hoursToDays)
            .toFixed(precision)
          : Number(Template.instance().totalHours.get() / 8).toFixed(precision)
      }
    }
    return Template.instance().totalHours.get()
  },
})

import dayjs from 'dayjs';
import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from './lib/prisma'

function todayWithTimeSetToZero() {
  return dayjs().startOf('day').toDate()
}

export async function appRoutes(app: FastifyInstance) {
  app.post('/habits', async (request) => {
    const createHabitBody = z.object({
      title: z.string(),
      weekDays: z.array(
        z.number().min(0).max(6)
      )
    })
    
    const { title, weekDays } = createHabitBody.parse(request.body)
    
    await prisma.habit.create({
      data: {
        title,
        created_at: todayWithTimeSetToZero(),
        weekDays: {
          create: weekDays.map(weekDay => {
            return {
              week_day: weekDay
            }
          })
        }
      }
    })
  })
  
  app.get('/day', async (request) => {
    const getDayParams = z.object({
      date: z.coerce.date()
    })
    
    const { date } = getDayParams.parse(request.query)
    
    const weekDay = dayjs(date).get('day')
    
    const possibleHabits = await prisma.habit.findMany({
      where: {
        created_at: {
          lte: date,
        },
        weekDays: {
          some: {
            week_day: weekDay,
          }
        },
      },
      include: {
        weekDays: {
          select: {
            week_day: true
          }
        },
      },
    })
    
    const day = await prisma.day.findUnique({
      where: {
        date: date,
      },
      include: {
        dayHabits: {
          select: {
            habit_id: true
          }
        }
      }
    })
    
    const completedHabits = day?.dayHabits 

    return {
      possibleHabits,
      completedHabits,
    }
  })
  
  app.patch('/habits/:id/toggle', async (request) => {
    const toggleHabitParams = z.object({
      id: z.string().uuid()
    })

    const { id } = toggleHabitParams.parse(request.params)

    const today = dayjs().startOf('day').toDate()

    let day = await prisma.day.findUnique({
      where: {
        date: today
      }
    })
    
    const dayWasNotFound = !day

    if(dayWasNotFound) {
      day = await prisma.day.create({
        data: {
          date: today
        }
      })
    }

    const dayHabit = await prisma.dayHabit.findUnique({
      where: {
        day_id_habit_id: {
          day_id: day!.id,
          habit_id: id
        }
      }
    })
    
    const hasAlreadyCompletedTheHabit = dayHabit

    if(hasAlreadyCompletedTheHabit) {
      await prisma.dayHabit.delete({
        where: {
          id: dayHabit.id
        }
      })
    } else {
      await prisma.dayHabit.create({
        data: {
          day_id: day!.id,
          habit_id: id
        }
      })
    }
  })

  app.get('/summary', async () => {
    const summary = await prisma.$queryRaw`
      SELECT
        D.id, 
        D.date,
        (
          SELECT 
            cast(count(*) as float)
          FROM day_habits DH
          WHERE DH.day_id = D.id
        ) as completed,
        (
          SELECT
            cast(count(*) as float)
          FROM habit_week_days HDW
          JOIN habits H
            ON H.id = HDW.habit_id
          WHERE
            HDW.week_day = cast(strftime('%w', D.date/1000.0, 'unixepoch') as int)
            AND H.created_at <= D.date
        ) as amount
      FROM days D
    `

    return summary
  })
}

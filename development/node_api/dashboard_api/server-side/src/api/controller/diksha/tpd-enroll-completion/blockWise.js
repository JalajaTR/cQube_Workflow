const router = require('express').Router();
const { logger } = require('../../../lib/logger');
const auth = require('../../../middleware/check-auth');
const s3File = require('../../../lib/reads3File');

router.post('/blockData', auth.authController, async (req, res) => {
    try {
        logger.info('--- diksha chart allData api ---');
        let timePeriod = req.body.timePeriod;
        let districtId = req.body.districtId;
        let programId = req.body.programId;
        let courseId = req.body.courseId;
        var fileName = `diksha_tpd/report2/${timePeriod}/block/collections/${districtId}.json`;
        let jsonData = await s3File.readFileConfig(fileName);

        var footer = jsonData['footer'][`${districtId}`];
        if(programId !== undefined && courseId !== undefined){
            var  result = jsonData.data.filter( data => {
               return data.program_id === programId 
               
            }).filter( block => {
                return block.collection_id === courseId
            })
        }
      
    //    console.log('result1', result1)
        // jsonData = jsonData.data.filter(a => {
        //     return a.district_id == districtId;
        // });
      result  = result.filter(a => {
            return a.district_id == districtId;
        });

        var chartData = {
            labels: '',
            data: ''
        }

       result = result.sort((a, b) => (a.block_name > b.block_name) ? 1 : -1);
        chartData['labels'] = result.map(a => {
            return a.block_name
        })
        chartData['data'] = result.map(a => {
            // return { enrollment: a.total_enrolled, completion: a.total_completed, percent_teachers: a.percentage_teachers, percent_completion: a.percentage_completion }
            return { enrollment: a.total_enrolled, completion: a.total_completed, certificate_value: a.certificate_count }
        })
        logger.info('--- diksha chart allData api response sent ---');
        res.send({ chartData, downloadData: result, footer });
    } catch (e) {
        logger.error(`Error :: ${e}`)
        res.status(500).json({ errMessage: "Internal error. Please try again!!" });
    }
})


module.exports = router;